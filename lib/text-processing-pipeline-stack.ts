import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class TextProcessingPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================
    // 1. DynamoDB Table
    // ========================
    const textDataTable = new dynamodb.Table(this, 'TextDataTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========================
    // 2. Lambda Function
    // ========================
    const textProcessor = new lambda.Function(this, 'TextProcessor', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/text-processor'),
      environment: {
        TABLE_NAME: textDataTable.tableName,
        LOG_LEVEL: 'DEBUG'
      },
      logRetention: logs.RetentionDays.ONE_WEEK
    });

    // Grant DynamoDB write access
    textDataTable.grantWriteData(textProcessor);

    // ========================
    // 3. API Gateway (with explicit deployment)
    // ========================
    const api = new apigateway.RestApi(this, 'TextProcessingApi', {
      restApiName: 'TextProcessingService',
      description: 'API for processing text files',
      deploy: false, // We'll create deployment manually
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['*']
      }
    });

    // Add resource and method
    const resource = api.root.addResource('process-text');
    const integration = new apigateway.LambdaIntegration(textProcessor);
    resource.addMethod('POST', integration, {
      authorizationType: apigateway.AuthorizationType.NONE
    });

    // Create deployment explicitly
    const deployment = new apigateway.Deployment(this, 'Deployment', {
      api
    });

    // Create stage with logging enabled
    new apigateway.Stage(this, 'Stage', {
      deployment,
      stageName: 'prod',
      loggingLevel: apigateway.MethodLoggingLevel.INFO,
      dataTraceEnabled: true,
      metricsEnabled: true
    });

    // Manually grant invoke permissions
    textProcessor.addPermission('ApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${api.restApiId}/*/*/*`
    });

    // ========================
    // 4. Monitoring
    // ========================
    new cloudwatch.Alarm(this, 'LambdaErrors', {
      metric: textProcessor.metricErrors(),
      threshold: 1,
      evaluationPeriods: 1
    });

    new cloudwatch.Alarm(this, 'Api5xxErrors', {
      metric: api.metricServerError(),
      threshold: 1,
      evaluationPeriods: 1
    });

    // ========================
    // 5. Outputs
    // ========================
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: `https://${api.restApiId}.execute-api.${this.region}.amazonaws.com/prod/process-text`,
      description: 'Endpoint for text processing API'
    });
  }
}
