import { Schema } from 'effect'
import { Update } from 'foldkit'
import { type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import {
  change,
  click,
  expect,
  given,
  role,
  scene,
  selector,
  text,
} from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { selectField } from './field'
import { sectionHeading } from './states'
import { body, head, row, sortableTh, table, td } from './table'

// HARNESS

const HarnessModel = Schema.Struct({
  flag: Schema.String,
  sort: Schema.Literals(['markets', 'chains']),
  order: Schema.Literals(['asc', 'desc']),
})

type HarnessModel = typeof HarnessModel.Type

const HarnessMessage = defineMessageUnion({
  UpdatedFlag: { value: Schema.String },
  SortedMarkets: {},
})

type HarnessMessage = typeof HarnessMessage.Type

const harnessUpdate = (
  model: HarnessModel,
  message: HarnessMessage,
): Update.Return<HarnessModel, HarnessMessage> =>
  HarnessMessage.match(message, {
    UpdatedFlag: ({ value }) => ({
      model: modifyFields(model, { flag: () => value }),
    }),
    SortedMarkets: () => ({
      model: modifyFields(model, {
        order: (order) => order === 'asc' ? 'desc' : 'asc',
      }),
    }),
  })

const harnessView = (model: HarnessModel, h: HtmlBuilder<HarnessMessage>): Html =>
  h.div([], [
    selectField({
      id: 'coverage-filter',
      label: 'Coverage',
      value: model.flag,
      choices: [
        { value: 'all', label: 'All coins' },
        { value: 'blocked', label: 'Blocked routes' },
        { value: 'single', label: 'Single market' },
      ],
      hint: 'Which coins the listing holds.',
      onChange: (value) => HarnessMessage.UpdatedFlag({ value }),
      h,
    }),
    table(h, [
      head(h, [
        sortableTh({
          label: 'Markets',
          column: 'markets',
          sort: model.sort,
          order: model.order,
          isNumeric: true,
          onSort: () => HarnessMessage.SortedMarkets(),
          h,
        }),
      ]),
      body(h, [row(h, [td(h, '12', { isNumeric: true })])]),
    ]),
    sectionHeading({
      title: 'Transfer matrix',
      note: 'Every route between two markets.',
      h,
    }),
  ])

const idleHarness: HarnessModel = { flag: 'all', sort: 'markets', order: 'asc' }

const filterField = role('combobox', { name: 'Coverage' })
const marketsSort = role('button', { name: 'Sort by Markets, currently ascending' })
const marketsHeader = selector('th')

describe('view helpers', () => {
  test('the filter select holds the query value', () => {
    scene(
      { update: harnessUpdate, view: harnessView },
      given(idleHarness),
      expect(filterField).toExist(),
      expect(text('Blocked routes')).toExist(),
      change(filterField, 'blocked'),
      expect(filterField).toHaveValue('blocked'),
    )
  })

  test('the numeric sortable header announces and aligns', () => {
    scene(
      { update: harnessUpdate, view: harnessView },
      given(idleHarness),
      expect(marketsSort).toExist(),
      expect(marketsHeader).toHaveAttr('aria-sort', 'asc'),
      click(marketsSort),
      expect(role('button', { name: 'Sort by Markets, currently descending' })).toExist(),
      expect(marketsHeader).toHaveAttr('aria-sort', 'desc'),
      expect(marketsHeader).toHaveClass('text-right'),
    )
  })

  test('the section heading pairs its title with its note', () => {
    scene(
      { update: harnessUpdate, view: harnessView },
      given(idleHarness),
      expect(text('Transfer matrix')).toExist(),
      expect(text('Every route between two markets.')).toExist(),
    )
  })
})
