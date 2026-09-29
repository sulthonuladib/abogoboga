CREATE TABLE "opportunity" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "opportunity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cryptocurrencyId" integer NOT NULL,
	"buyExchangeId" integer NOT NULL,
	"sellExchangeId" integer NOT NULL,
	"buyPrice" double precision DEFAULT 0 NOT NULL,
	"sellPrice" double precision DEFAULT 0 NOT NULL,
	"buyVolume" double precision DEFAULT 0 NOT NULL,
	"sellVolume" double precision DEFAULT 0 NOT NULL,
	"buyTickTimestamp" bigint DEFAULT 0 NOT NULL,
	"sellTickTimestamp" bigint DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_crypto_buy_sell_unique" UNIQUE("cryptocurrencyId","buyExchangeId","sellExchangeId")
);
--> statement-breakpoint
DROP TABLE "orderbook_snapshot";--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_cryptocurrencyId_cryptocurrency_id_fkey" FOREIGN KEY ("cryptocurrencyId") REFERENCES "cryptocurrency"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_buyExchangeId_exchange_id_fkey" FOREIGN KEY ("buyExchangeId") REFERENCES "exchange"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_sellExchangeId_exchange_id_fkey" FOREIGN KEY ("sellExchangeId") REFERENCES "exchange"("id") ON DELETE CASCADE ON UPDATE CASCADE;