import { describe, expect, it } from 'vitest'
import type { InfraGraph } from './infraGraph.ts'
import { parseTerraformFiles, type TerraformStack } from './parseTerraform.ts'
import {
  MAX_TERRAFORM_RESOURCES,
  reduceEdges,
  terraformGraph,
  terraformGraphError,
  terraformSummary,
  terraformWarnings,
} from './terraformGraph.ts'
import { MISSING_STATE, NETWORK_STATE, SECRET_STATE, SHOP_PLAN, SHOP_STATE } from './testTerraform.ts'

const PLAIN = { environment: true, c4: false }
const stacksOf = async (...files: [string, string][]) => (await parseTerraformFiles(files.map(([name, text]) => ({ name, text })))).stacks

/** The links of the graph as `source -> target` by the first lines of their nodes. */
const links = (graph: InfraGraph) => graph.edges.map((edge) => `${graph.nodes[edge.source]!.lines[0]} -> ${graph.nodes[edge.target]!.lines[0]}`)
const node = (graph: InfraGraph, name: string) => graph.nodes.find((item) => item.lines[0] === name)!

describe('terraformGraph', () => {
  it('draws resources by their types, with their details, keys and properties, and a module as a frame', async () => {
    const stacks = await stacksOf(['state.json', SHOP_STATE])
    const graph = terraformGraph(stacks, PLAIN)

    expect(graph.nodes.map((item) => [item.shape, item.lines, item.frame])).toEqual([
      ['rectangle', ['aws_vpc.main', '10.0.0.0/16'], null],
      ['rectangle', ['aws_subnet.private', '10.0.1.0/24, ×2'], null],
      ['firewall', ['aws_security_group.web'], null],
      ['rectangle', ['aws_iam_role.app'], null],
      ['server', ['aws_instance.web', 't3.micro, ×2'], null],
      ['database', ['aws_db_instance.main', 'postgres 16.3, db.t3.micro'], null],
      ['cache', ['aws_elasticache_cluster.this', 'redis 7.1, cache.t3.micro'], 0],
    ])
    expect(graph.frames).toEqual([{ shape: 'boundary', label: 'module.cache', parent: null, key: 'module.cache' }])
    expect(node(graph, 'aws_elasticache_cluster.this').key).toBe('module.cache.aws_elasticache_cluster.this')
    expect(node(graph, 'aws_instance.web').element).toEqual({
      name: 'aws_instance.web',
      technology: 'aws_instance',
      description: 'Terraform: aws_instance.web, экземпляров: 2\nПровайдер: hashicorp/aws\ninstance_type = t3.micro\navailability_zone = eu-central-1a',
    })
    expect(terraformSummary(stacks, graph)).toBe('Ресурсов: 7, связей: 7, модулей: 1')
  })

  it('draws no link that follows from the others', async () => {
    const graph = terraformGraph(await stacksOf(['state.json', SHOP_STATE]), PLAIN)

    expect(links(graph)).toEqual([
      'aws_subnet.private -> aws_vpc.main',
      'aws_security_group.web -> aws_vpc.main',
      'aws_instance.web -> aws_iam_role.app',
      'aws_instance.web -> aws_security_group.web',
      'aws_instance.web -> aws_subnet.private',
      'aws_db_instance.main -> aws_security_group.web',
      'aws_elasticache_cluster.this -> aws_security_group.web',
    ])
  })

  it('puts a module in the frame of its parent and links through outputs of modules', async () => {
    const stacks = await stacksOf(['plan.json', SHOP_PLAN])
    const graph = terraformGraph(stacks, PLAIN)

    expect(graph.frames).toEqual([
      { shape: 'boundary', label: 'module.network', parent: null, key: 'module.network' },
      { shape: 'boundary', label: 'module.app', parent: null, key: 'module.app' },
      { shape: 'boundary', label: 'module.db', parent: 1, key: 'module.app.module.db' },
    ])
    expect(node(graph, 'aws_ecs_service.api')).toMatchObject({ shape: 'container', frame: 1 })
    expect(node(graph, 'aws_rds_cluster.main')).toMatchObject({ shape: 'database', lines: ['aws_rds_cluster.main', 'aurora-postgresql 16.4'], frame: 2 })
    expect(node(graph, 'aws_s3_bucket.files').shape).toBe('object-storage')
    expect(node(graph, 'aws_lb.web').lines).toEqual(['aws_lb.web', 'application'])
    expect(links(graph)).toEqual([
      'aws_instance.app -> aws_subnet.this',
      'aws_iam_policy.read -> aws_s3_bucket.files',
      'aws_lb.web -> aws_subnet.this',
      'aws_subnet.this -> aws_vpc.this',
      'aws_ecs_service.api -> aws_subnet.this',
    ])
    expect(terraformSummary(stacks, graph)).toBe('Ресурсов: 8, связей: 5, модулей: 3')
  })

  it('makes shapes of C4 with the type and the details in the label and the details as the description', async () => {
    const graph = terraformGraph(await stacksOf(['state.json', SHOP_STATE]), { environment: true, c4: true })

    expect(node(graph, 'aws_db_instance.main')).toMatchObject({
      shape: 'c4-database',
      lines: ['aws_db_instance.main', '[Container: aws_db_instance]', 'postgres 16.3, db.t3.micro'],
      element: { description: 'postgres 16.3, db.t3.micro' },
    })
    expect(node(graph, 'aws_instance.web')).toMatchObject({ shape: 'c4-container', lines: ['aws_instance.web', '[Container: aws_instance]', 't3.micro, ×2'] })
    expect(node(graph, 'aws_iam_role.app').shape).toBe('c4-container')
  })

  it('frames each of several files, with its name in the keys', async () => {
    const stacks = await stacksOf(['network.json', NETWORK_STATE], ['app.json', SHOP_STATE])
    const graph = terraformGraph(stacks, PLAIN)

    expect(graph.frames.map((frame) => [frame.label, frame.parent, frame.key])).toEqual([
      ['network.json', null, 'network.json'],
      ['app.json', null, 'app.json'],
      ['module.cache', 1, 'app.json/module.cache'],
    ])
    expect(graph.nodes.filter((item) => item.lines[0] === 'aws_vpc.main').map((item) => [item.frame, item.key])).toEqual([
      [0, 'network.json/aws_vpc.main'],
      [1, 'app.json/aws_vpc.main'],
    ])
    expect(terraformSummary(stacks, graph)).toBe('Ресурсов: 8, связей: 7, модулей: 1, стеков: 2')
  })

  it('keeps every value Terraform marks sensitive out of the graph', async () => {
    const graph = terraformGraph(await stacksOf(['state.json', SECRET_STATE]), PLAIN)

    expect(JSON.stringify(graph)).not.toMatch(/hunter2|db-admin-user|S3cr3t|top-secret-bucket/)
    expect(node(graph, 'aws_s3_bucket.secret').element!.description).toBe('Terraform: aws_s3_bucket.secret\nПровайдер: hashicorp/aws\nregion = eu-central-1')
  })

  it('refuses more resources than the limit', () => {
    const many: TerraformStack = {
      name: 'big.json',
      resources: Array.from({ length: MAX_TERRAFORM_RESOURCES + 1 }, (_, index) => ({
        address: `aws_instance.web${index}`,
        module: [],
        type: 'aws_instance',
        name: `web${index}`,
        provider: null,
        instances: 1,
        attributes: [],
        dependsOn: [],
      })),
      missing: [],
      locals: [],
      deleted: [],
      errored: false,
    }
    const graph = terraformGraph([many], PLAIN)

    expect(terraformGraphError(graph)).toBe('Слишком много ресурсов: 301, за раз можно добавить не больше 300')
    expect(terraformGraphError(terraformGraph([{ ...many, resources: many.resources.slice(1) }], PLAIN))).toBeNull()
  })
})

describe('reduceEdges', () => {
  const edge = (source: number, target: number) => ({ source, target, label: '' })

  it('drops the links that follow from the others', () => {
    expect(reduceEdges([edge(0, 1), edge(0, 2), edge(1, 2), edge(2, 3), edge(0, 3)], 4)).toEqual([edge(0, 1), edge(1, 2), edge(2, 3)])
  })

  it('keeps the links of a cycle, which Terraform does not have', () => {
    const cycle = [edge(0, 1), edge(1, 0), edge(0, 2), edge(1, 2)]
    expect(reduceEdges(cycle, 3)).toEqual(cycle)
  })
})

describe('terraformWarnings', () => {
  it('names the types of universal shapes and the links to resources the file does not have', async () => {
    expect(terraformWarnings(await stacksOf(['state.json', SHOP_STATE]))).toEqual([
      'Своей фигуры нет, нарисованы универсальной: aws_vpc, aws_subnet, aws_iam_role',
    ])
    expect(terraformWarnings(await stacksOf(['state.json', MISSING_STATE]))).toEqual([
      'Своей фигуры нет, нарисованы универсальной: aws_vpc',
      'state.json: нет в файле, связи не показаны: aws_instance.web → aws_security_group.legacy',
    ])
  })

  it('names what a plan does not show, what it deletes, and a plan that failed', async () => {
    const plan = JSON.parse(SHOP_PLAN) as { errored?: boolean }
    plan.errored = true

    expect(terraformWarnings(await stacksOf(['plan.json', JSON.stringify(plan)]))).toEqual([
      'Своей фигуры нет, нарисованы универсальной: aws_iam_policy, aws_vpc, aws_subnet',
      'plan.json: план завершился с ошибкой — ресурсов может не хватать',
      'plan.json: план не выводит local.*, связи через них могут отсутствовать: aws_instance.app',
      'plan.json: план удаляет, на схеме их нет: aws_instance.legacy',
    ])
  })

  it('counts the resources of a type and lists ten types at most', async () => {
    const resources = Array.from({ length: 12 }, (_, index) => ({
      address: `t${index}.x`,
      mode: 'managed',
      type: `t${index}`,
      name: 'x',
      values: {},
    }))
    resources.push({ address: 't0.y', mode: 'managed', type: 't0', name: 'y', values: {} })
    const stacks = await stacksOf(['state.json', JSON.stringify({ format_version: '1.0', values: { root_module: { resources } } })])

    expect(terraformWarnings(stacks)).toEqual(['Своей фигуры нет, нарисованы универсальной: t0 ×2, t1, t2, t3, t4, t5, t6, t7, t8, t9 и ещё 2'])
  })
})
