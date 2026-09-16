import {
  cryptocurrencyOrderByKeysSchema,
  cryptocurrencySearchByKeysSchema,
} from "./cryptocurrency.schema";

export const CryptocurrencySearchByOptions =
  cryptocurrencySearchByKeysSchema.options;
export const CryptocurrencyOrderByOptions =
  cryptocurrencyOrderByKeysSchema.options;
