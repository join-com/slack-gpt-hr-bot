import * as dotenv from 'dotenv';
dotenv.config();
import bolt from '@slack/bolt';
const { App } = bolt;

import { getLLMResponse } from './lib/getLLMResponse.js';

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true, // Connect using websockets, no need for ngrok or similar.
});

app.event('message', async ({ event, client }) => {
  try {
    // Check if the message is from a direct message channel
    if (event.channel_type === 'im' && event.text) {
      // Send a loading message
      const loadingMessageResponse = await client.chat.postMessage({
        channel: event.channel,
        text: 'Thinking...',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Thinking... :thinking_face:',
            },
          },
        ],
      });

      // Fetch the last 6 messages in the conversation history
      const historyResult = await client.conversations.history({
        channel: event.channel,
        latest: event.ts, // Fetch history up to the current message timestamp
        inclusive: false, // Exclude the current message from the history
        limit: 6, // Limit the number of messages fetched
      });

      // Create a new array of QUESTION, RESPONSE strings to pass to the LLM
      const formattedHistory = historyResult.messages
        .map((message) => {
          const messageType =
            message.user === event.user ? 'USER MESSAGE' : 'SYSTEM RESPONSE';
          return `${messageType}:${message.text}`;
        })
        .reverse();

      // Get a response from the LLM
      const response = await getLLMResponse(event.text, formattedHistory);

      // Create an array of source document blocks filtered to remove duplicates
      const sourceDocumentBlocks = response.sourceDocuments
        .filter(
          (doc, index, self) =>
            index ===
            self.findIndex((d) => d.metadata.title === doc.metadata.title)
        )
        .map((doc, index) => ({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*<${doc.metadata.url}|Source ${index + 1}: ${
              doc.metadata.title
            }>*`,
          },
        }));

      // Update the loading message with the chat function's response
      await client.chat.update({
        channel: event.channel,
        ts: loadingMessageResponse.ts,
        text: response.text,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: response.text,
            },
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Top Source Documents:*',
            },
          },
          ...sourceDocumentBlocks,
        ],
      });
    }
  } catch (error) {
    console.error(error);
  }
});

(async () => {
  // Start the app
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();
