import { Option, Result } from 'effect'
import { AsyncData } from 'foldkit'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'

import { initialModel } from './model'
import { Message } from './message'
import * as Chains from './page/chains'
import { AppRoute } from './route'
import { update } from './update'

const urlOrThrow = (raw: string) =>
  Option.getOrThrowWith(
    fromString(raw),
    () => new Error(`Failed to parse url: ${raw}`),
  )

const chainsRoute = AppRoute.Chains({
  search: Option.none(),
  sort: Option.none(),
  order: Option.none(),
  page: Option.none(),
})

describe('route change', () => {
  test('a route change to a page with no seed fetches', () => {
    story(
      update,
      given(initialModel),
      message(Message.ChangedUrl({ url: urlOrThrow('http://localhost/chains') })),
      model((next) => {
        expect(next.route._tag).toBe('Chains')
        expect(AsyncData.isLoading(next.chains.chains)).toBe(true)
      }),
      Command.resolve(
        Chains.FetchChains,
        Chains.Message.SettledFetchChains({ result: Result.fail('unreachable') }),
      ),
      model((next) => {
        expect(AsyncData.isFailure(next.chains.chains)).toBe(true)
      }),
    )
  })

  test('a route change that leaves the query unchanged fetches nothing', () => {
    story(
      update,
      given(modifyFields(initialModel, {
        route: () => chainsRoute,
        chains: (chains) =>
          modifyFields(chains, { chains: () => AsyncData.Loading() }),
      })),
      message(Message.ChangedUrl({ url: urlOrThrow('http://localhost/chains') })),
      model((next) => {
        expect(next.route._tag).toBe('Chains')
        expect(AsyncData.isLoading(next.chains.chains)).toBe(true)
      }),
      Command.expectNone(),
    )
  })
})
