import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import type { Response } from 'express'
import { errorResponse } from '../server/_lib/errors.js'

function mockResponse() {
  let statusCode = 200
  let jsonBody: Record<string, unknown> | null = null
  const res = {
    status(code: number) {
      statusCode = code
      return this
    },
    json(body: Record<string, unknown>) {
      jsonBody = body
      return this
    },
  } as unknown as Response

  return {
    res,
    getStatus: () => statusCode,
    getBody: () => jsonBody,
  }
}

test('errorResponse returns sanitized public message and correlationId', () => {
  const { res, getStatus, getBody } = mockResponse()

  errorResponse(res, 500, 'Failed to create project', new Error('column "secret_col" violates constraint'), {
    route: 'POST /api/projects',
  })

  assert.equal(getStatus(), 500)
  const body = getBody()
  assert.ok(body)
  assert.equal(body['error'], 'Failed to create project')
  assert.equal(typeof body['correlationId'], 'string')
  assert.ok((body['correlationId'] as string).length > 0)
})

test('errorResponse never includes SQL text, column names, or constraint names in client response', () => {
  const { res, getBody } = mockResponse()

  const postgresError = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "projects_slug_key"',
    detail: 'Key (slug)=(test-slug) already exists.',
    table: 'projects',
    schema: 'public',
  }

  errorResponse(res, 400, 'Project name or slug already exists', postgresError, {
    route: 'POST /api/projects',
    projectId: 'p-123',
  })

  const body = getBody()
  assert.ok(body)
  assert.equal(body['error'], 'Project name or slug already exists')
  assert.deepEqual(Object.keys(body).sort(), ['correlationId', 'error'])

  const responseString = JSON.stringify(body)
  assert.equal(responseString.includes('projects_slug_key'), false)
  assert.equal(responseString.includes('test-slug'), false)
  assert.equal(responseString.includes('23505'), false)
  assert.equal(responseString.includes('public'), false)
})

test('errorResponse logs correlation ID and error details server-side', () => {
  const logs: string[] = []
  const origError = console.error
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '))
  }

  try {
    const { res, getBody } = mockResponse()
    const err = new Error('simulated driver fault')
    errorResponse(res, 500, 'Internal server failure', err, {
      route: 'GET /api/projects/:id',
      projectId: 'proj-abc',
    })

    const body = getBody()
    assert.ok(body)
    const correlationId = body['correlationId'] as string

    assert.equal(logs.length, 1)
    const logOutput = logs[0]
    assert.ok(logOutput.includes(`[api-error] ${correlationId}: Internal server failure`))
    assert.ok(logOutput.includes('proj-abc'))
    assert.ok(logOutput.includes('simulated driver fault'))
  } finally {
    console.error = origError
  }
})

test('server/routes/ contains zero raw .json({ error: *.message }) leaks', () => {
  const routesDir = path.resolve('server/routes')
  const files = fs.readdirSync(routesDir).filter((f) => f.endsWith('.ts'))

  for (const file of files) {
    const content = fs.readFileSync(path.join(routesDir, file), 'utf-8')
    const matches = content.match(/\.json\(\s*\{\s*error:\s*[^}]*\.message\s*\}\s*\)/g)
    assert.equal(
      matches,
      null,
      `Found raw error.message leak in server/routes/${file}: ${JSON.stringify(matches)}`,
    )
  }
})
