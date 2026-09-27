import { Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { expect, given, role, scene } from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { ChainPageResponse } from '../../api'
import { chainsUrl, defaultChainsQuery } from '../../route'
import { Model, initialModel } from './model'
import { update } from './update'
import { view } from './view'

const fixturePage = Schema.decodeUnknownSync(ChainPageResponse)({
  data: [
    {
      id: 1,
      name: 'Ethereum',
      code: 'ETH',
      createdAt: '2024-01-02T03:04:05.000Z',
      updatedAt: '2024-01-02T03:04:05.000Z',
    },
    {
      id: 2,
      name: 'Bitcoin',
      code: 'BTC',
      createdAt: '2024-01-03T03:04:05.000Z',
      updatedAt: '2024-01-03T03:04:05.000Z',
    },
  ],
  meta: {
    items: 42,
    pages: 3,
    page: 1,
    limit: 20,
    from: 1,
    to: 2,
    hasNextPage: true,
    hasPreviousPage: false,
    search: '',
    searchBy: 'name',
    order: 'asc',
    orderBy: 'name',
  },
})

const loadedModel: Model = modifyFields(initialModel, {
  query: () => defaultChainsQuery,
  chains: () => AsyncData.succeed(fixturePage),
})

describe('chains listing', () => {
  test('page numbers are links that mark the current page', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(role('link', { name: 'Page 2' })).toHaveAttr(
        'href',
        chainsUrl({ ...defaultChainsQuery, page: 2 }),
      ),
      expect(role('link', { name: 'Page 1' })).toHaveAttr('aria-current', 'page'),
      expect(role('button', { name: 'Page 2' })).toBeAbsent(),
    )
  })

  test('per-row controls keep their accessible names without tooltips', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(role('button', { name: 'Edit ETH' })).toHaveAccessibleName('Edit ETH'),
      expect(role('button', { name: 'Remove ETH' })).toHaveAccessibleName('Remove ETH'),
      expect(role('tooltip')).toBeAbsent(),
    )
  })
})
