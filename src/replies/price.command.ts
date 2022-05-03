import Web3 from 'web3';
import {
  WenLamboNFT,
  NFTKeysMarketplaceAddress,
  garageContract,
  harmonyChainId,
} from '../values';
import NFTKeyMarketplaceABI from '../resources/NFTKeyMarketplaceABI.json'; // from https://nftkey.app/marketplace-contracts/, see BSC / FTM / AVAX explorer for ABI
import garagemanager from '../resources/garagemanager.json';
import { AbiItem } from 'web3-utils';
import { numberWithCommas } from '../utils/utils';
import { maxLamboMintId, batchSizeLambos } from '../utils/constants';
import { AttributeData } from '../types';
import axios from 'axios';

const web3 = new Web3('https://api.harmony.one');
const nftkeysMarketplaceContract = new web3.eth.Contract(
  NFTKeyMarketplaceABI as AbiItem[],
  NFTKeysMarketplaceAddress
);

const gm = new web3.eth.Contract(garagemanager as AbiItem[], garageContract);

interface Listing {
  tokenId: number;
  value: number;
  seller: string;
  expireTimestamp: number;
}

// global variables for caching
export let priceHVILLEperONE = 0;
export let priceONEperUSD = 0;
export let priceHVILLEperUSD = 0;

export let totalTransactionValueUsdCached = 0;
export let totalTransactionValueOneCached = 0;
export let transactionValue7dUsdCached = 0;
export let transactionValue7dOneCached = 0;
export let transactionValue30dUsdCached = 0;
export let transactionValue30dOneCached = 0;
export let numSoldCached = 0;
export let avgPriceSoldOneCached = 0;

export const numMinutesCache = 1;
const divideConst = 1e18;

export interface PlotEarning {
  count: number;
  countListed: number;
  earningSpeed: number;
  floorPrice: number;
}

export let earningSpeedsArr: PlotEarning[] = [];

// cache every numMinutesCache in background (not upon query)
(async () => {
  while (true) {
    try {
      axios
        .all([
          axios.get(
            'https://api.coingecko.com/api/v3/simple/price?ids=harmony&vs_currencies=usd'
          ),
          axios.get(
            'https://api.coingecko.com/api/v3/simple/price?ids=harmonyville&vs_currencies=usd'
          ),
        ])
        .then((respArr) => {
          priceONEperUSD = respArr[0].data['harmony']['usd'];
          priceHVILLEperUSD = respArr[1].data['harmonyville']['usd'];
          priceHVILLEperONE = priceHVILLEperUSD / priceONEperUSD;
        });
    } catch (error) {
      console.log('pricing error', error);
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 1000 * 60 * numMinutesCache)
    );
  }
})();

(async () => {
  while (true) {
    try {
      const earningSpeedsArrTemp: PlotEarning[] = [];

      // all lambos
      for (
        let earningSpeedParam = 1;
        earningSpeedParam <= 30;
        earningSpeedParam++
      ) {
        try {
          const res = await axios.post('https://nftkey.app/graphql', {
            operationName: 'GetERC721TokenCountNew',
            variables: {
              input: {
                collectionId: `${WenLamboNFT}_${harmonyChainId}`,
                filters: {
                  traits: [{ type: 'Speed', values: [`${earningSpeedParam}`] }],
                },
                pageSize: maxLamboMintId + 1,
              },
            },
            query:
              'query GetERC721TokenCountNew($input: GetERC721TokensByCollectionIdInput!) {\n  erc721Tokens(input: $input) {\n    count\n    tokens {\n      tokenId\n      __typename\n    }\n    __typename\n  }\n}\n',
          });

          const respData = await res.data;
          if (
            respData['data'] &&
            respData['data']['erc721Tokens'] &&
            respData['data']['erc721Tokens']['count'] &&
            respData['data']['erc721Tokens']['count'] > 0
          ) {
            earningSpeedsArrTemp.push({
              earningSpeed: earningSpeedParam,
              count: respData['data']['erc721Tokens']['count'],
              countListed: 0,
              floorPrice: 0,
            });
          }
        } catch (error) {
          console.log('earning speed', earningSpeedParam, 'error', error);
          await new Promise((resolve) => setTimeout(resolve, 1000)); // wait before retry if looping through listings fails
          continue;
        }
      }

      // lambos for sale
      let numListings: number = 0;
      try {
        numListings = await nftkeysMarketplaceContract.methods
          .numTokenListings(WenLamboNFT)
          .call();
      } catch (error) {
        console.log('get numTokenListings error', error);
      }

      let currBatchCount = 0;
      let startingIdx = 1 + currBatchCount * batchSizeLambos;

      while (startingIdx <= numListings) {
        try {
          const tokenListings: Listing[] =
            await nftkeysMarketplaceContract.methods
              .getTokenListings(WenLamboNFT, startingIdx, batchSizeLambos)
              .call();

          // value 0 = not listed
          const tokenListingsListed = tokenListings.filter(
            (t) => t.value !== 0
          );

          for (const i in tokenListingsListed) {
            const t = tokenListingsListed[i];
            const price = t.value / divideConst;

            if (price !== 0) {
              // TODO find more optimised way?
              const nftData: AttributeData = await gm.methods
                .getTokenAttributes(t.tokenId)
                .call();
              const earningSpeed = nftData.speed;

              const idx = earningSpeedsArrTemp.findIndex(
                (e) => e.earningSpeed - earningSpeed === 0
              );

              if (idx > -1) {
                const e = earningSpeedsArrTemp[idx];
                earningSpeedsArrTemp[idx] = {
                  ...e,
                  countListed: e.countListed + 1,
                  floorPrice:
                    e.floorPrice === 0 ? price : Math.min(e.floorPrice, price),
                };
              }
            }
          }

          currBatchCount++;
          startingIdx = 1 + currBatchCount * batchSizeLambos;
        } catch (error) {
          console.log('getTokenListings error', error);
          await new Promise((resolve) => setTimeout(resolve, 1000)); // wait before retry if looping through listings fails
          continue;
        }
      }

      earningSpeedsArr = earningSpeedsArrTemp;
    } catch (error) {
      // should not have error unless numTokenListings has error
      // any getTokenListings errors should be caught within inner try/catch
      console.log('nft token listings error', error);
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 1000 * 60 * numMinutesCache)
    );
  }
})();

(async () => {
  while (true) {
    try {
      // getting total sales
      const res = await axios.post('https://nftkey.app/graphql', {
        operationName: 'ERC721TradingHistory',
        variables: {
          id: `${WenLamboNFT}_${harmonyChainId}`,
        },
        query:
          'query ERC721TradingHistory($id: ID!) {\n  erc721TradingHistoryById(id: $id) {\n    id\n    lastUpdatedTimestamp\n    totalVolume\n    last7DVolume\n    last30DVolume\n    totalVolumeUsd\n    last7DVolumeUsd\n    last30DVolumeUsd\n    totalSalesCount\n    avgPrice\n    dailyVolume {\n      startTime\n      avgPrice\n      volume\n      count\n      __typename\n    }\n    __typename\n  }\n}\n',
      });
      const respData = await res.data;
      if (
        respData &&
        respData['data'] &&
        respData['data']['erc721TradingHistoryById']
      ) {
        const data = respData['data']['erc721TradingHistoryById'];

        totalTransactionValueUsdCached = data['totalVolumeUsd'];
        totalTransactionValueOneCached = data['totalVolume'];
        transactionValue7dUsdCached = data['last7DVolumeUsd'];
        transactionValue7dOneCached = data['last7DVolume'];
        transactionValue30dUsdCached = data['last30DVolumeUsd'];
        transactionValue30dOneCached = data['last30DVolume'];
        numSoldCached = data['totalSalesCount'];
        avgPriceSoldOneCached = data['avgPrice'];
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * 60 * numMinutesCache)
      );
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 10));
    }
  }
})();

export const getPrice = async (): Promise<string> => {
  try {
    const priceResponse = `
1 ONE \\= **$${priceONEperUSD.toFixed(3)}**
1 HVILLE \\= **$${priceHVILLEperUSD.toFixed(
      3
    )}** \\= **${priceHVILLEperONE.toFixed(3)} ONE**
    `.trim();

    let earningSpeedResponse = '';
    if (earningSpeedsArr.length > 0) {
      earningSpeedResponse = earningSpeedsArr
        .sort((a, b) => a.earningSpeed - b.earningSpeed)
        .map(
          (e) =>
            `**${e.earningSpeed}** HVILLE/day: **${e.count}** lambos${
              e.countListed > 0
                ? ` (**${e.countListed}** listed; FP **${e.floorPrice.toFixed(
                    0
                  )}** ONE \\= $${(priceONEperUSD * e.floorPrice).toFixed(
                    0
                  )} \\= ${(e.floorPrice / priceHVILLEperONE).toFixed(
                    0
                  )} HVILLE; HVILLE ROI in **${Math.ceil(
                    e.floorPrice / priceHVILLEperONE / e.earningSpeed
                  )} days**)`
                : ''
            }`
        )
        .join('\n');
    }

    let totalTransactionsResponse = '';
    if (
      totalTransactionValueUsdCached > 0 &&
      totalTransactionValueOneCached > 0 &&
      transactionValue7dUsdCached > 0 &&
      transactionValue7dOneCached > 0 &&
      transactionValue30dUsdCached > 0 &&
      transactionValue30dOneCached > 0 &&
      numSoldCached > 0 &&
      avgPriceSoldOneCached > 0
    ) {
      totalTransactionsResponse = `Total Volume Traded: **${numberWithCommas(
        (totalTransactionValueOneCached / 1e6).toFixed(1)
      )}m** ONE = $${(totalTransactionValueUsdCached / 1e6).toFixed(1)}m
7D Volume: **${numberWithCommas(
        (transactionValue7dOneCached / 1e3).toFixed(1)
      )}k** ONE = $${(transactionValue7dUsdCached / 1e3).toFixed(1)}K
30D Volume: **${numberWithCommas(
        (transactionValue30dOneCached / 1e3).toFixed(1)
      )}k** ONE = $${(transactionValue30dUsdCached / 1e3).toFixed(1)}K
Average Price Sold: **${avgPriceSoldOneCached.toFixed(2)}** ONE
Total Sold: **${numberWithCommas(numSoldCached.toString())}**
        `;
    }

    const response = `
${priceResponse}

${earningSpeedResponse}

${totalTransactionsResponse}`.trim();

    return response;
  } catch {
    return 'Fetching prices...';
  }
};
