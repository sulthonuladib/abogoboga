ALTER TABLE "cryptocurrency" RENAME COLUMN "cmcId" TO "coingeckoId";--> statement-breakpoint
ALTER TABLE "cryptocurrency" ALTER COLUMN "coingeckoId" SET DATA TYPE varchar(255) USING "slug";--> statement-breakpoint
ALTER TABLE "cryptocurrency" RENAME CONSTRAINT "cryptocurrency_cmcId_unique" TO "cryptocurrency_coingeckoId_unique";--> statement-breakpoint
ALTER TABLE "exchange" RENAME COLUMN "cmcId" TO "coingeckoId";--> statement-breakpoint
ALTER TABLE "exchange" ALTER COLUMN "coingeckoId" SET DATA TYPE varchar(255) USING "id"::text;--> statement-breakpoint
ALTER TABLE "exchange" RENAME CONSTRAINT "exchange_cmcId_unique" TO "exchange_coingeckoId_unique";
