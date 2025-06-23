# 📝 Text Processing Pipeline

A serverless pipeline built with AWS CDK that receives raw text via API Gateway, processes it using a Lambda function (counts words and lines), and stores results in DynamoDB.

## ⚙️ Prerequisites

- AWS CLI configured (`aws configure`)
- Node.js v16+ and npm
- AWS CDK installed globally (`npm install -g aws-cdk`)

## 🚀 Setup, Deployment, Testing & Cleanup

```bash
# Clone and enter project directory
cd text-processing-pipeline

# Install root dependencies
npm install

# Build Lambda function
cd lambda/text-processor
npm install
npm run build
cd ../..

# Deploy infrastructure
cdk deploy

# Test the API (replace with actual endpoint)
curl -X POST \
  -H "Content-Type: text/plain" \
  --data-binary @"manoj.txt" \
  https://<api-id>.execute-api.<region>.amazonaws.com/prod/process-text

# Example expected response:
# {
#   "message": "Text processed successfully",
#   "processingId": "123456789",
#   "wordCount": 5,
#   "lineCount": 2
# }

# Cleanup resources
cdk destroy

