import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';

const dynamoDb = new DynamoDB.DocumentClient();
const tableName = process.env.TABLE_NAME!;

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  try {
    // 1. Check if a file (body) is uploaded
    if (!event.body) {
      const response = {
        statusCode: 400,
        body: JSON.stringify({ message: 'No file uploaded.' }),
      };
      logResponse(response, event, context);
      return response;
    }

    // 2. Validate Content-Type header (expect text/plain for .txt files)
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !contentType.toLowerCase().includes('text/plain')) {
      const response = {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid file type. Only text/plain (.txt) files are allowed.' }),
      };
      logResponse(response, event, context);
      return response;
    }

    // 3. Decode file data from base64 or plain text
    const fileBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'utf-8');

    // 4. Check file size limits
    if (fileBuffer.length === 0) {
      const response = {
        statusCode: 400,
        body: JSON.stringify({ message: 'Uploaded file is empty.' }),
      };
      logResponse(response, event, context);
      return response;
    }

    if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
      const response = {
        statusCode: 400,
        body: JSON.stringify({ message: `File size exceeds the 1MB limit. Your file size: ${fileBuffer.length} bytes.` }),
      };
      logResponse(response, event, context);
      return response;
    }

    // 5. Convert buffer to string and check content (no whitespace-only)
    const rawText = fileBuffer.toString('utf-8');
    if (rawText.trim().length === 0) {
      const response = {
        statusCode: 400,
        body: JSON.stringify({ message: 'Uploaded file contains no meaningful text (only whitespace).' }),
      };
      logResponse(response, event, context);
      return response;
    }

    // 6. Analyze text content
    const { wordCount, lineCount, normalizedText } = analyzeText(rawText);

    if (wordCount === 0 && lineCount === 0) {
      const response = {
        statusCode: 400,
        body: JSON.stringify({ message: 'No text content found after processing.' }),
      };
      logResponse(response, event, context);
      return response;
    }

    // 7. Save processed data to DynamoDB
    const processingId = Date.now().toString();

    await dynamoDb.put({
      TableName: tableName,
      Item: {
        id: processingId,
        textContent: normalizedText.length > 1000
          ? normalizedText.substring(0, 1000) + '...'
          : normalizedText,
        wordCount,
        lineCount,
        processedAt: new Date().toISOString(),
      },
    }).promise();

    const response = {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Text processed successfully',
        processingId,
        wordCount,
        lineCount,
      }),
    };
    logResponse(response, event, context);
    return response;

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    const response = {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error processing text',
        error: errMessage,
        requestId: context.awsRequestId,
      }),
    };
    logError(errMessage, event, context);
    logResponse(response, event, context);
    return response;
  }
};

function analyzeText(rawText: string): {
  wordCount: number;
  lineCount: number;
  normalizedText: string;
} {
  const normalizedText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  const wordCount = normalizedText
    .split(/\s+/)
    .filter(word => word.trim().length > 0).length;

  const lineCount = normalizedText
    .split('\n')
    .filter(line => line.trim().length > 0).length;

  return { wordCount, lineCount, normalizedText };
}

function logError(message: string, event: APIGatewayProxyEvent, context: Context) {
  console.error('--- Error Log ---');
  console.error('Timestamp:', new Date().toISOString());
  console.error('Request ID:', context.awsRequestId);
  console.error('Message:', message);
  console.error('Request Headers:', JSON.stringify(event.headers, null, 2));
  console.error('Request Body (short):', (event.body || '').substring(0, 200));
  console.error('--- End Error Log ---');
}

function logResponse(response: APIGatewayProxyResult, event: APIGatewayProxyEvent, context: Context) {
  console.log('--- Lambda Response ---');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Request ID:', context.awsRequestId);
  console.log('Status Code:', response.statusCode);
  console.log('Response Body:', response.body);
  console.log('--- End Response Log ---');
}

