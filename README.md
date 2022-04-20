**Work In Progress**

### Requirements

1. Create a `secrets.ts` in the `src` folder with the following:

```
export const DISCORD_BOT_TOKEN = 'bbb';
export const DISCORD_REALTIME_CHANNEL_ID = 'ccc';    // channel should be a TEXT_CHANNEL; can be obtained by right-clicking channel and selecting "Copy ID"
export const DISCORD_REALTIME_CHANNEL_WEBHOOK_ID = 'ddd';    // see below for getting this info from discord
export const DISCORD_REALTIME_CHANNEL_WEBHOOK_TOKEN = 'eee';
export const DISCORD_REALTIME_CHANNEL_WEBHOOK_MESSAGE_ID = 'fff';

export const BOT_DISPLAY_NAME = 'WenLambo Bot';
export const BOT_AVATAR_URL = 'https://app.wenlambo.one/images/logo.png';
```

where `DISCORD_REALTIME_CHANNEL_WEBHOOK_MESSAGE_ID` should be the message ID of a single message in a locked voice channel (i.e. create a message there first)

### Discord Bot

#### Requirements

1. Node.js v16.14.0

#### Installation

1. `npm i`

#### Configuring Discord Bot

1. See https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks for discord webhooks; create it for the specific (read-only) channel: first part is the webhook ID, second part is the webhook token
2. Go to the Discord Developer Portal -> click on relevant application -> Bot -> enable all Privileged Gateway Intents

### Running the Application

`yarn build / npm run build` then `yarn start / npm start`
