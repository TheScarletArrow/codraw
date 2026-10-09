import { describe, expect, it } from 'vitest'
import { MAX_DOCUMENT_SIZE } from '../apiSpec/loadDocument.ts'
import { parseTerraform, parseTerraformFiles, traversal, type TerraformStack } from './parseTerraform.ts'
import { HCL_CONFIG, MISSING_STATE, RAW_STATE, REGIONS_STATE, SECRET_STATE, SHOP_PLAN, SHOP_STATE } from './testTerraform.ts'

const parse = (text: string, name = 'state.json') => parseTerraform({ name, text })
const resource = (stack: TerraformStack, address: string) => stack.resources.find((item) => item.address === address)!

describe('traversal', () => {
  it('reads the names of addresses and references without the keys of instances', () => {
    expect(traversal('module.app["eu.west"].aws_instance.web[0].id')).toEqual(['module', 'app', 'aws_instance', 'web', 'id'])
    expect(traversal('data.aws_iam_policy_document.read.json')).toEqual(['data', 'aws_iam_policy_document', 'read', 'json'])
    expect(traversal('var.subnets[*]')).toEqual(['var', 'subnets'])
  })
})

describe('parseTerraform of a state', () => {
  it('reads a resource per address of the configuration with its instances, provider and safe attributes', async () => {
    const stack = await parse(SHOP_STATE)

    expect(stack.resources.map((item) => item.address)).toEqual([
      'aws_vpc.main',
      'aws_subnet.private',
      'aws_security_group.web',
      'aws_iam_role.app',
      'aws_instance.web',
      'aws_db_instance.main',
      'module.cache.aws_elasticache_cluster.this',
    ])
    expect(resource(stack, 'aws_instance.web')).toEqual({
      address: 'aws_instance.web',
      module: [],
      type: 'aws_instance',
      name: 'web',
      provider: 'hashicorp/aws',
      instances: 2,
      attributes: [
        ['instance_type', 't3.micro'],
        ['availability_zone', 'eu-central-1a'],
      ],
      dependsOn: ['aws_iam_role.app', 'aws_security_group.web', 'aws_subnet.private', 'aws_vpc.main'],
    })
    expect(resource(stack, 'module.cache.aws_elasticache_cluster.this').module).toEqual(['cache'])
    expect(stack).toMatchObject({ name: 'state.json', missing: [], locals: [], deleted: [], errored: false })
  })

  it('reads no value that Terraform marks sensitive nor any that is not known to be safe', async () => {
    const database = resource(await parse(SHOP_STATE), 'aws_db_instance.main')

    expect(database.attributes).toEqual([
      ['identifier', 'shop'],
      ['engine', 'postgres'],
      ['engine_version', '16.3'],
      ['instance_class', 'db.t3.micro'],
      ['allocated_storage', '20'],
    ])
    const secrets = await parse(SECRET_STATE)
    expect(JSON.stringify(secrets)).not.toMatch(/hunter2|db-admin-user|S3cr3t|top-secret-bucket/)
    expect(resource(secrets, 'aws_s3_bucket.secret').attributes).toEqual([['region', 'eu-central-1']])
  })

  it('makes one resource of the instances of the instances of a module', async () => {
    const stack = await parse(REGIONS_STATE)

    expect(stack.resources.map((item) => [item.address, item.instances, item.module])).toEqual([
      ['module.app.aws_instance.web', 2, ['app']],
      ['module.app.aws_lb.web', 2, ['app']],
    ])
    expect(resource(stack, 'module.app.aws_lb.web').dependsOn).toEqual(['module.app.aws_instance.web'])
  })

  it('names dependencies on resources the file does not have', async () => {
    const stack = await parse(MISSING_STATE)

    expect(stack.missing).toEqual([['aws_instance.web', 'aws_security_group.legacy']])
    expect(resource(stack, 'aws_instance.web').dependsOn).toEqual(['aws_vpc.main'])
  })
})

describe('parseTerraform of a plan', () => {
  it('reads the resources after the plan with dependencies through outputs and variables of modules and data sources', async () => {
    const stack = await parse(SHOP_PLAN, 'plan.json')

    expect(stack.resources.map((item) => [item.address, item.dependsOn])).toEqual([
      ['aws_instance.app', ['module.network.aws_subnet.this']],
      ['aws_s3_bucket.files', []],
      ['aws_iam_policy.read', ['aws_s3_bucket.files']],
      ['aws_lb.web', ['module.network.aws_subnet.this']],
      ['module.network.aws_vpc.this', []],
      ['module.network.aws_subnet.this', ['module.network.aws_vpc.this']],
      ['module.app.aws_ecs_service.api', ['module.network.aws_subnet.this']],
      ['module.app.module.db.aws_rds_cluster.main', []],
    ])
    expect(resource(stack, 'module.app.module.db.aws_rds_cluster.main').module).toEqual(['app', 'db'])
  })

  it('names new resources with local values, deleted resources, and reads no variable or sensitive value', async () => {
    const stack = await parse(SHOP_PLAN, 'plan.json')

    expect(stack.locals).toEqual(['aws_instance.app'])
    expect(stack.deleted).toEqual(['aws_instance.legacy'])
    expect(stack.missing).toEqual([])
    expect(JSON.stringify(stack)).not.toContain('hunter2')
    expect(resource(stack, 'module.app.module.db.aws_rds_cluster.main').attributes).toEqual([
      ['engine', 'aurora-postgresql'],
      ['engine_version', '16.4'],
    ])
  })

  it('checks the sensitive values of the changes of a plan too, and tells of a plan that failed', async () => {
    const plan = JSON.parse(SHOP_PLAN) as { errored?: boolean; resource_changes: { change: { after_sensitive: unknown } }[] }
    plan.errored = true
    plan.resource_changes[0]!.change.after_sensitive = { instance_type: true }
    const stack = await parse(JSON.stringify(plan), 'plan.json')

    expect(resource(stack, 'aws_instance.app').attributes).toEqual([])
    expect(stack.errored).toBe(true)
  })

  it('follows depends_on of a resource and of a module call, `module.x` there being all of its resources, and no ephemeral resource', async () => {
    const plan = {
      format_version: '1.2',
      planned_values: {
        root_module: {
          resources: [{ address: 'aws_instance.web', mode: 'managed', type: 'aws_instance', name: 'web', values: {} }],
          child_modules: [
            { address: 'module.db', resources: [{ address: 'module.db.aws_db_instance.main', mode: 'managed', type: 'aws_db_instance', name: 'main', values: {} }] },
            { address: 'module.dns', resources: [{ address: 'module.dns.aws_route53_record.web', mode: 'managed', type: 'aws_route53_record', name: 'web', values: {} }] },
          ],
        },
      },
      configuration: {
        root_module: {
          resources: [
            {
              address: 'aws_instance.web',
              mode: 'managed',
              type: 'aws_instance',
              name: 'web',
              depends_on: ['module.db'],
              expressions: {
                user_data: { references: ['ephemeral.random_password.boot.result', 'ephemeral.random_password.boot', 'path.module', 'terraform.workspace'] },
              },
            },
          ],
          module_calls: {
            db: { module: { resources: [{ address: 'aws_db_instance.main', mode: 'managed', type: 'aws_db_instance', name: 'main' }] } },
            dns: { depends_on: ['aws_instance.web'], module: { resources: [{ address: 'aws_route53_record.web', mode: 'managed', type: 'aws_route53_record', name: 'web' }] } },
          },
        },
      },
    }
    const stack = await parse(JSON.stringify(plan), 'plan.json')

    expect(resource(stack, 'aws_instance.web').dependsOn).toEqual(['module.db.aws_db_instance.main'])
    expect(resource(stack, 'module.dns.aws_route53_record.web').dependsOn).toEqual(['aws_instance.web'])
    expect(stack.missing).toEqual([])
  })
})

describe('parseTerraform errors', () => {
  it('names the command that gives what it reads', async () => {
    await expect(parse(RAW_STATE, 'terraform.tfstate')).rejects.toThrow(
      'terraform.tfstate: это файл состояния — выполните terraform show -json и откройте результат',
    )
    await expect(parse(HCL_CONFIG, 'main.tf')).rejects.toThrow('main.tf: это конфигурация Terraform — сохраните план или состояние командой terraform show -json')
    await expect(parse('{"resource": {"aws_instance": {"web": {"ami": "ami-1"}}}}', 'main.tf.json')).rejects.toThrow(
      'main.tf.json: это конфигурация Terraform — сохраните план или состояние командой terraform show -json',
    )
    await expect(parse('PK\u0003\u0004binary', 'plan.out')).rejects.toThrow(
      'plan.out: это двоичный файл плана — выполните terraform show -json для него и откройте результат',
    )
    await expect(parse('{"openapi": "3.0.0"}', 'openapi.json')).rejects.toThrow('openapi.json: это не вывод terraform show -json — нет format_version')
    await expect(parse('{"format_version": "1.0", "terraform_version": "1.9.5"}')).rejects.toThrow('state.json: в файле нет ресурсов')
  })

  it('tells the line of an error of JSON and refuses a file larger than 20 MB', async () => {
    await expect(parse('{\n  "format_version": "1.0",\n  "values": {,}\n}')).rejects.toThrow(/^state\.json: строка 3, столбец \d+ — /)
    await expect(parseTerraform({ name: 'plan.json', text: '', size: 4 * MAX_DOCUMENT_SIZE + 1 })).rejects.toThrow('plan.json: файл больше 20 МБ')
    expect(await parseTerraform({ name: 'plan.json', text: SHOP_STATE, size: MAX_DOCUMENT_SIZE + 1 })).toBeTruthy()
  })

  it('adds the files it can read and names the others', async () => {
    const { stacks, errors } = await parseTerraformFiles([
      { name: 'terraform.tfstate', text: RAW_STATE },
      { name: 'state.json', text: SHOP_STATE },
    ])

    expect(stacks.map((stack) => stack.name)).toEqual(['state.json'])
    expect(errors).toEqual(['terraform.tfstate: это файл состояния — выполните terraform show -json и откройте результат'])
  })
})
