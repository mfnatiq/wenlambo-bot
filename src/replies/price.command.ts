import Web3 from 'web3';
import {
  WenLamboNFT,
  NFTKeysMarketplaceAddress,
  GM,
  HVILLE,
  garageContract,
} from '../values';
import NFTKeyMarketplaceABI from '../resources/NFTKeyMarketplaceABI.json'; // from https://nftkey.app/marketplace-contracts/, see BSC / FTM / AVAX explorer for ABI
import garagemanager from '../resources/garagemanager.json';
// import MarsColony from '../resources/MC.json';
import { AbiItem } from 'web3-utils';
import { escapeBrackets, escapeDot } from '../utils/utils';
import {
  minLamboMintId,
  maxLamboMintId,
  batchSizeLambos,
} from '../utils/constants';
import { AttributeData } from '../types';
import axios from 'axios';

const web3 = new Web3('https://api.harmony.one');
const nftkeysMarketplaceContract = new web3.eth.Contract(
  NFTKeyMarketplaceABI as AbiItem[],
  NFTKeysMarketplaceAddress
);

const gm = new web3.eth.Contract(garagemanager as AbiItem[], garageContract);

// const mc = new web3.eth.Contract(MarsColony.abi as AbiItem[], WenLamboNFT);

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

let currBlockNumCached = 0;
export let totalTransactionValueCached = 0;
export let numSoldCached = 0;

export const numMinutesCache = 2;
const divideConst = 1e18;
const listingsBatchSize = 1024;

export interface PlotEarning {
  count: number;
  countListed: number;
  earningSpeed: number;
  floorPrice: number;
}

export let earningSpeedsArr: PlotEarning[] = [];

interface TokenBoughtListing {
  tokenId: string;
  value: string;
  seller: string;
  expireTimestamp: number;
}

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
        let currIdx = minLamboMintId;
        currIdx < maxLamboMintId;
        currIdx += batchSizeLambos
      ) {
        const nftDataAll: AttributeData[] = await gm.methods
          .getTokenAttributesMany(
            Array.from({ length: batchSizeLambos }, (_, i) => i + currIdx)
          )
          .call();

        for (let [nftDataIdx, nftData] of nftDataAll.entries()) {
          let earningSpeed = nftData.speed;

          while (earningSpeed < 1 || earningSpeed > 30) {
            nftData = await gm.methods
              .getTokenAttributes(nftDataIdx + currIdx)
              .call();
            earningSpeed = nftData.speed;
          }

          const idx = earningSpeedsArrTemp.findIndex(
            (e) => e.earningSpeed === earningSpeed
          );
          if (idx > -1) {
            earningSpeedsArrTemp[idx] = {
              ...earningSpeedsArrTemp[idx],
              count: earningSpeedsArrTemp[idx].count + 1,
            };
          } else {
            earningSpeedsArrTemp.push({
              earningSpeed: earningSpeed,
              count: 1,
              countListed: 0,
              floorPrice: 0,
            });
          }
        }
      }

      // lambos for sale
      const numListings: number = await nftkeysMarketplaceContract.methods
        .numTokenListings(WenLamboNFT)
        .call();

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
            (t) => t.value / divideConst !== 0
          );

          const nftData: AttributeData[] = await gm.methods
            .getTokenAttributesMany(tokenListingsListed.map((t) => t.tokenId))
            .call();

          for (const i in tokenListingsListed) {
            const t = tokenListingsListed[i];
            const price = t.value / divideConst;

            const earningSpeed = nftData[i].speed;

            if (price !== 0) {
              const idx = earningSpeedsArrTemp.findIndex(
                (e) => e.earningSpeed === earningSpeed
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
          console.log('earningSpeedsArrTemp:', earningSpeedsArrTemp);
        } catch (error) {
          console.log(error);
          await new Promise((resolve) => setTimeout(resolve, 1000)); // wait before retry if looping through listings fails
          continue;
        }
      }
      earningSpeedsArr = earningSpeedsArrTemp;
    } catch (error) {
      // should not have error unless numTokenListings has error
      // any getTokenListings errors should be caught within inner try/catch
      console.log('nft pricing error', error);
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
      const latestBlockNum = await web3.eth.getBlockNumber();

      // let currBlockNum = 20758264; // https://nftkey.app/marketplace-contracts/ -> Harmony Blockchain -> Transaction Hash -> Block Number
      // let currBlockNum = 22287096; // manual testing of approximate block number of first transaction

      // for caching purposes
      // TODO store this in db / json file
      let currBlockNum = 25437465;
      let totalTransactionValue = 7414751.450031001;
      let numSold = 5404;

      while (currBlockNum < latestBlockNum) {
        const toBlock = Math.min(
          currBlockNum + listingsBatchSize - 1,
          latestBlockNum
        );

        const events = await nftkeysMarketplaceContract.getPastEvents(
          'TokenBought',
          {
            fromBlock: currBlockNum,
            toBlock: toBlock,
            address: NFTKeysMarketplaceAddress,
            filter: {
              erc721Address: WenLamboNFT,
            },
          }
        );

        if (events && events.length > 0) {
          const tokensBoughtData = events.map(
            (e) => e.returnValues.listing as TokenBoughtListing
          );
          const tokensPricesBought = tokensBoughtData.map((t) => {
            const tokenId = Number(t.tokenId);
            if (tokenId > maxLamboMintId || tokenId < minLamboMintId) {
              console.log('ERROR:', t.tokenId, Number(t.value) / divideConst);
              return 0;
            }
            return Number(t.value) / divideConst;
          });

          for (const t of tokensPricesBought) {
            if (t > 0) {
              numSold++;
              totalTransactionValue += t;
            }
          }
        }

        currBlockNum = toBlock + 1;
      }

      currBlockNumCached = currBlockNum;
      totalTransactionValueCached = totalTransactionValue;
      numSoldCached = numSold;

      console.log('----------------------');
      console.log(
        'NFTKEY TRANSACTIONS:',
        currBlockNumCached,
        totalTransactionValueCached,
        numSoldCached
      );

      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * 60 * numMinutesCache)
      );
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 10));
    }
  }
})();

export const getPrice = async (
  footer?: any,
  includeDexscreener?: boolean
): Promise<string> => {
  try {
    const priceResponse = `
1 ONE \\= **$${escapeDot(priceONEperUSD.toFixed(3))}**
1 HVILLE \\= **$${escapeDot(priceHVILLEperUSD.toFixed(3))}** \\= **${escapeDot(
      priceHVILLEperONE.toFixed(3)
    )} ONE**
    `.trim();

    let earningSpeedResponse = '';
    if (earningSpeedsArr.length > 0) {
      earningSpeedResponse =
        'Listings from NFTKey\n' +
        earningSpeedsArr
          .sort((a, b) => a.earningSpeed - b.earningSpeed)
          .map(
            (e) =>
              `**${e.earningSpeed}** HVILLE/day: **${e.count}** lambos${
                e.countListed > 0
                  ? ` (**${
                      e.countListed
                    }** listed, floor price **${e.floorPrice.toFixed(
                      0
                    )}** ONE \\= $${(priceONEperUSD * e.floorPrice).toFixed(
                      0
                    )} \\= ${escapeDot(
                      (e.floorPrice / priceHVILLEperONE).toFixed(0)
                    )} HVILLE)`
                  : ''
              }`
          )
          .join('\n');
    }

    let totalTransactionsResponse = '';
    if (
      currBlockNumCached > 0 &&
      totalTransactionValueCached > 0 &&
      numSoldCached > 0
    ) {
      totalTransactionsResponse = `Total Volume Traded: **${escapeDot(
        (totalTransactionValueCached / 1e6).toFixed(1)
      )}m** ONE
Total Sold: **${numSoldCached}**
        `;
    }

    const response = escapeBrackets(
      `
${priceResponse}

${earningSpeedResponse}

${totalTransactionsResponse}` +
        (footer
          ? `
${footer}
`
          : '')
    ).trim();

    if (includeDexscreener) {
      return (
        `[Dexscreener](https:\\/\\/dexscreener\\.com\\/harmony\\/0xcd818813f038a4d1a27c84d24d74bbc21551fa83)` +
        '\n' +
        response
      );
    } else {
      return response;
    }
  } catch {
    return 'Fetching prices...' + footer ? '\n\n' + footer : '';
  }
};
