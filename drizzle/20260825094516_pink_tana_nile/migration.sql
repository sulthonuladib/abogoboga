CREATE TYPE "public"."exchangeBaseCurrency" AS ENUM('usdt', 'idr');--> statement-breakpoint
CREATE TABLE "chain" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chain_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"code" varchar(255) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chain_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "cryptocurrency" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"symbol" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"logo" varchar(255) NOT NULL,
	"cmcId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cryptocurrency_slug_unique" UNIQUE("slug"),
	CONSTRAINT "cryptocurrency_cmcId_unique" UNIQUE("cmcId")
);
--> statement-breakpoint
CREATE TABLE "exchange_cryptocurrency_chain" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "exchange_cryptocurrency_chain_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"exchangeChainCode" varchar(255) NOT NULL,
	"exchangeCryptocurrencyId" integer NOT NULL,
	"chainId" integer NOT NULL,
	"exchangeChainName" varchar(255),
	"withdrawEnabled" boolean DEFAULT true NOT NULL,
	"depositEnabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_cryptocurrency_chain_unique" UNIQUE("exchangeCryptocurrencyId","chainId")
);
--> statement-breakpoint
CREATE TABLE "exchange_cryptocurrency" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "exchange_cryptocurrency_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"exchangeId" integer NOT NULL,
	"cryptocurrencyId" integer NOT NULL,
	"exchangeSymbol" varchar(255) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_cryptocurrency_exchange_crypto_unique" UNIQUE("exchangeId","cryptocurrencyId")
);
--> statement-breakpoint
CREATE TABLE "exchange" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "exchange_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cmcId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"logo" varchar(255) NOT NULL,
	"registeredOnCmc" boolean DEFAULT true NOT NULL,
	"baseCurrency" "exchangeBaseCurrency" NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_cmcId_unique" UNIQUE("cmcId"),
	CONSTRAINT "exchange_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "exchange_cryptocurrency_chain" ADD CONSTRAINT "exchange_cryptocurrency_chain_exchangeCryptocurrencyId_exchange_cryptocurrency_id_fk" FOREIGN KEY ("exchangeCryptocurrencyId") REFERENCES "public"."exchange_cryptocurrency"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "exchange_cryptocurrency_chain" ADD CONSTRAINT "exchange_cryptocurrency_chain_chainId_chain_id_fk" FOREIGN KEY ("chainId") REFERENCES "public"."chain"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "exchange_cryptocurrency" ADD CONSTRAINT "exchange_cryptocurrency_exchangeId_exchange_id_fk" FOREIGN KEY ("exchangeId") REFERENCES "public"."exchange"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "exchange_cryptocurrency" ADD CONSTRAINT "exchange_cryptocurrency_cryptocurrencyId_cryptocurrency_id_fk" FOREIGN KEY ("cryptocurrencyId") REFERENCES "public"."cryptocurrency"("id") ON DELETE cascade ON UPDATE cascade;