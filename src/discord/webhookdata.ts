import { Client, ColorResolvable, MessageEmbed } from 'discord.js';
import {
  avgPriceSoldOneCached,
  earningSpeedsArr,
  getPrice,
  numMinutesCache,
  numSoldCached,
  priceHVILLEperONE,
  priceHVILLEperUSD,
  priceONEperUSD,
  totalTransactionValueUsdCached,
  totalTransactionValueOneCached,
  transactionValue30dUsdCached,
  transactionValue30dOneCached,
  transactionValue7dUsdCached,
  transactionValue7dOneCached,
} from '../replies/price.command';
// import { getCLNYStats } from '../replies/stats.command';
import {
  DISCORD_REALTIME_CHANNEL_ID,
  DISCORD_REALTIME_CHANNEL_WEBHOOK_ID,
  DISCORD_REALTIME_CHANNEL_WEBHOOK_MESSAGE_ID,
  DISCORD_REALTIME_CHANNEL_WEBHOOK_TOKEN,
  BOT_DISPLAY_NAME,
  BOT_AVATAR_URL,
} from '../secrets';

const username = BOT_DISPLAY_NAME || 'WenLambo Bot';
const avatarUrl = BOT_AVATAR_URL || 'https://app.wenlambo.one/images/logo.png';

interface SectionData {
  colour: ColorResolvable;
  authorIconUrl: string;
  authorName: string;
}

// all colours taken from sampling each image (in authorIconUrl) with https://imagecolorpicker.com/en
const sectionsData: SectionData[] = [
  {
    colour: '#3ddacf',
    authorIconUrl:
      'https://s2.coinmarketcap.com/static/img/coins/200x200/3945.png',
    authorName: 'Token Prices',
  },
  {
    colour: '#f6c83a',
    authorIconUrl: 'https://app.wenlambo.one/images/logo.png',
    authorName: 'Lambos Data (~2min delayed)',
  },
  {
    colour: '#ffffff',
    authorIconUrl:
      'https://dashboard-assets.dappradar.com/document/6406/nftkey-dapp-marketplaces-ethereum-logo-166x166_50ad814bfd3ab7dcdd1bba4090f83a15.png',
    authorName: 'Transactions Data',
  },
  {
    colour: '#e42d06',
    authorIconUrl:
      'https://aws1.discourse-cdn.com/standard17/uploads/marscolony/original/1X/73f77e8e1a03287b99217692129344d4441f8bf3.png',
    authorName: 'HVILLE Statistics',
  },
];

export const updateRealtimeChannelPriceData = async (discordClient: Client) => {
  try {
    const realtimeChannel = discordClient.channels.cache.get(
      DISCORD_REALTIME_CHANNEL_ID
    );
    if (realtimeChannel) {
      const webhook = await realtimeChannel.client.fetchWebhook(
        DISCORD_REALTIME_CHANNEL_WEBHOOK_ID,
        DISCORD_REALTIME_CHANNEL_WEBHOOK_TOKEN
      );

      try {
        (async () => {
          while (true) {
            try {
              let embedMessage = await getEmbedMessage();
              webhook.editMessage(DISCORD_REALTIME_CHANNEL_WEBHOOK_MESSAGE_ID, {
                embeds: embedMessage,
              });

              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * 60 * numMinutesCache)
              );
            } catch (err) {
              console.log('webhook edit message error');
              console.log(err);
            }
          }
        })();
      } catch (embedMessageErr) {
        console.log('fetching embed message error');
        console.log(embedMessageErr);

        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * 60 * numMinutesCache)
        );
      }
    }
  } catch (err) {
    console.log('webhook error');
    console.log(err);

    await new Promise((resolve) =>
      setTimeout(resolve, 1000 * 60 * numMinutesCache)
    );
  }
};

const getEmbedMessage = async (): Promise<MessageEmbed[]> => {
  const priceData = await getPrice();
  // const statsData = await getCLNYStats();
  const statsData = '';

  const priceDataSections = priceData.split('\n\n');

  const messages = [
    new MessageEmbed()
      .setDescription(
        priceHVILLEperONE === 0 ||
          priceONEperUSD === 0 ||
          priceHVILLEperUSD === 0
          ? 'Fetching prices...'
          : priceDataSections[0]
      )
      .setAuthor({
        name: sectionsData[0].authorName,
        iconURL: sectionsData[0].authorIconUrl,
      })
      .setColor(sectionsData[0].colour),

    new MessageEmbed()
      .setDescription(
        (earningSpeedsArr.length > 0 && priceDataSections[1]) ||
          'Fetching lambos data...'
      )
      .setAuthor({
        name: sectionsData[1].authorName,
        iconURL: sectionsData[1].authorIconUrl,
      })
      .setColor(sectionsData[1].colour),

    new MessageEmbed()
      .setDescription(
        (totalTransactionValueUsdCached > 0 &&
          totalTransactionValueOneCached > 0 &&
          transactionValue7dUsdCached > 0 &&
          transactionValue7dOneCached > 0 &&
          transactionValue30dUsdCached > 0 &&
          transactionValue30dOneCached > 0 &&
          numSoldCached > 0 &&
          avgPriceSoldOneCached > 0 &&
          priceDataSections[2]) ||
          'Fetching transactions data...'
      )
      .setAuthor({
        name: sectionsData[2].authorName,
        iconURL: sectionsData[2].authorIconUrl,
      })
      .setColor(sectionsData[2].colour),
  ];

  if (statsData !== '') {
    messages.push(
      new MessageEmbed()
        .setDescription(statsData)
        .setAuthor({
          name: sectionsData[3].authorName,
          iconURL: sectionsData[3].authorIconUrl,
        })
        .setColor(sectionsData[3].colour)
    );
  }

  return messages;
};
