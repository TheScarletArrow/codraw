import { expect, test } from '@playwright/test'
import { cells, createBoard, edges, twoParticipants, userPage, vertices, type CellInfo } from './helpers.ts'

const AWS = 'registry.terraform.io/hashicorp/aws'

/** A resource of the values of a plan, as `terraform show -json` writes it. */
const resource = (address: string, values: Record<string, unknown>, sensitive: Record<string, unknown> = {}) => {
  const [type, name] = address.replace(/\[\d+\]$/, '').split('.').slice(-2)
  return { address, mode: 'managed', type, name, provider_name: AWS, values, sensitive_values: sensitive }
}

/** A plan of a balancer, two servers and a database in the subnet of the module `network`, with a sensitive password. */
const PLAN = JSON.stringify({
  format_version: '1.2',
  terraform_version: '1.9.5',
  variables: { db_password: { value: 'hunter2' } },
  planned_values: {
    root_module: {
      resources: [
        resource('aws_lb.web', { load_balancer_type: 'application' }),
        resource('aws_instance.web[0]', { instance_type: 't3.micro' }),
        resource('aws_instance.web[1]', { instance_type: 't3.micro' }),
        resource('aws_db_instance.main', { engine: 'postgres', engine_version: '16.3', instance_class: 'db.t3.micro', password: 'hunter2' }, { password: true }),
      ],
      child_modules: [
        {
          address: 'module.network',
          resources: [resource('module.network.aws_vpc.this', { cidr_block: '10.0.0.0/16' }), resource('module.network.aws_subnet.this', { cidr_block: '10.0.1.0/24' })],
        },
      ],
    },
  },
  configuration: {
    root_module: {
      resources: [
        { address: 'aws_lb.web', mode: 'managed', type: 'aws_lb', name: 'web', expressions: { subnets: { references: ['module.network.subnet_id', 'module.network'] } } },
        {
          address: 'aws_instance.web',
          mode: 'managed',
          type: 'aws_instance',
          name: 'web',
          count_expression: { constant_value: 2 },
          expressions: {
            ami: { references: ['data.aws_ami.ubuntu.id', 'data.aws_ami.ubuntu'] },
            subnet_id: { references: ['module.network.subnet_id', 'module.network'] },
          },
        },
        { address: 'data.aws_ami.ubuntu', mode: 'data', type: 'aws_ami', name: 'ubuntu', expressions: { owners: { constant_value: ['099720109477'] } } },
        {
          address: 'aws_db_instance.main',
          mode: 'managed',
          type: 'aws_db_instance',
          name: 'main',
          expressions: { password: { references: ['var.db_password'] }, db_subnet_group_name: { references: ['module.network.subnet_id', 'module.network'] } },
        },
      ],
      module_calls: {
        network: {
          source: './network',
          module: {
            outputs: { subnet_id: { expression: { references: ['aws_subnet.this.id', 'aws_subnet.this'] } } },
            resources: [
              { address: 'aws_vpc.this', mode: 'managed', type: 'aws_vpc', name: 'this', expressions: { cidr_block: { constant_value: '10.0.0.0/16' } } },
              { address: 'aws_subnet.this', mode: 'managed', type: 'aws_subnet', name: 'this', expressions: { vpc_id: { references: ['aws_vpc.this.id', 'aws_vpc.this'] } } },
            ],
          },
        },
      },
    },
  },
})

/** A state with a bucket alone. */
const STATE = JSON.stringify({ format_version: '1.0', values: { root_module: { resources: [resource('aws_s3_bucket.files', { bucket: 'shop-files' })] } } })

const LB = 'aws_lb.web\napplication'
const WEB = 'aws_instance.web\nt3.micro, ×2'
const DB = 'aws_db_instance.main\npostgres 16.3, db.t3.micro'
const VPC = 'aws_vpc.this\n10.0.0.0/16'
const SUBNET = 'aws_subnet.this\n10.0.1.0/24'

const inside = (frame: CellInfo, shape: CellInfo) =>
  shape.x >= frame.x && shape.y >= frame.y && shape.x + shape.width <= frame.x + frame.width && shape.y + shape.height <= frame.y + frame.height

test('a plan of Terraform becomes resources, links and frames of modules for everybody, without secrets, and is undone in one step', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт Terraform…' }).click()
  await menu.getByLabel('Файлы Terraform').setInputFiles([{ name: 'plan.json', mimeType: 'application/json', buffer: Buffer.from(PLAN) }])
  await expect(menu.getByRole('status')).toHaveText('Ресурсов: 5, связей: 4, модулей: 1')
  await expect(menu.getByRole('list', { name: 'Предупреждения' })).toHaveText('Своей фигуры нет, нарисованы универсальной: aws_vpc, aws_subnet')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()
  await expect(menu).toBeHidden()

  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.value).sort()).toEqual([LB, WEB, DB, VPC, SUBNET, 'module.network'].sort())
  const shapes = await vertices(bob)
  const byValue = (value: string) => shapes.find((cell) => cell.value === value)!
  expect(byValue(LB).style.codrawShape).toBe('load-balancer')
  expect(byValue(WEB).style.codrawShape).toBe('server')
  expect(byValue(DB).style.codrawShape).toBe('database')
  expect(byValue(VPC).style.codrawShape).toBe('rectangle')
  const network = byValue('module.network')
  expect(network.style.codrawShape).toBe('boundary')
  for (const value of [VPC, SUBNET]) expect(inside(network, byValue(value))).toBe(true)
  for (const value of [LB, WEB, DB]) expect(inside(network, byValue(value))).toBe(false)
  const name = (id: string | null) => shapes.find((cell) => cell.id === id)!.value.split('\n')[0]
  expect((await edges(bob)).map((edge) => `${name(edge.source)} -> ${name(edge.target)}`).sort()).toEqual(
    ['aws_lb.web -> aws_subnet.this', 'aws_instance.web -> aws_subnet.this', 'aws_db_instance.main -> aws_subnet.this', 'aws_subnet.this -> aws_vpc.this'].sort(),
  )
  expect(JSON.stringify(await cells(bob))).not.toContain('hunter2')

  await alice.getByTestId('diagram-canvas').click({ position: { x: 5, y: 5 } })
  await alice.keyboard.press('Control+z')
  await expect.poll(async () => (await cells(bob)).length).toBe(0)

  await close()
})

test('the window names the command for a file of state and for configuration, and adds the other files', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт Terraform…' }).click()
  await menu.getByLabel('Файлы Terraform').setInputFiles([
    { name: 'terraform.tfstate', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 4, serial: 1, resources: [] })) },
    { name: 'main.tf', mimeType: 'text/plain', buffer: Buffer.from('resource "aws_instance" "web" {\n  ami = "ami-1"\n}\n') },
    { name: 'state.json', mimeType: 'application/json', buffer: Buffer.from(STATE) },
  ])
  const alert = menu.getByRole('alert')
  await expect(alert).toContainText('terraform.tfstate: это файл состояния — выполните terraform show -json и откройте результат')
  await expect(alert).toContainText('main.tf: это конфигурация Terraform — сохраните план или состояние командой terraform show -json')
  await expect(menu.getByRole('status')).toHaveText('Ресурсов: 1, связей: 0, модулей: 0')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()

  await expect.poll(async () => (await vertices(alice)).map((cell) => [cell.value, cell.style.codrawShape])).toEqual([['aws_s3_bucket.files', 'object-storage']])

  await alice.context().close()
})
