CREATE TABLE "orderbook_snapshot" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orderbook_snapshot_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"exchangeCryptocurrencyId" integer NOT NULL,
	"exchangeId" integer NOT NULL,
	"buyPrice" double precision NOT NULL,
	"sellPrice" double precision NOT NULL,
	"buyAmount" double precision NOT NULL,
	"sellAmount" double precision NOT NULL,
	"tickTimestamp" bigint NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orderbook_snapshot_exchangeCryptocurrencyId_unique" UNIQUE("exchangeCryptocurrencyId")
);
--> statement-breakpoint
ALTER TABLE "orderbook_snapshot" ADD CONSTRAINT "orderbook_snapshot_exchangeCryptocurrencyId_exchange_cryptocurrency_id_fk" FOREIGN KEY ("exchangeCryptocurrencyId") REFERENCES "public"."exchange_cryptocurrency"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "orderbook_snapshot" ADD CONSTRAINT "orderbook_snapshot_exchangeId_exchange_id_fk" FOREIGN KEY ("exchangeId") REFERENCES "public"."exchange"("id") ON DELETE cascade ON UPDATE cascade;