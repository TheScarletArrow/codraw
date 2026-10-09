/** Outputs of `terraform show -json` for the tests of the import. */

const AWS = 'registry.terraform.io/hashicorp/aws'

interface Resource {
  address: string
  values?: Record<string, unknown>
  sensitive?: Record<string, unknown>
  dependsOn?: string[]
  data?: boolean
}

/** A resource of a module of values as Terraform writes it: its type and name come from the end of its address. */
function resource({ address, values = {}, sensitive = {}, dependsOn, data = false }: Resource) {
  const names = address.replace(/\[[^\]]*\]$/, '').split('.')
  const index = /\[(\d+)\]$/.exec(address)?.[1]
  return {
    address,
    mode: data ? 'data' : 'managed',
    type: names.at(-2)!,
    name: names.at(-1)!,
    ...(index !== undefined && { index: Number(index) }),
    provider_name: AWS,
    schema_version: 0,
    values,
    sensitive_values: sensitive,
    ...(dependsOn && { depends_on: dependsOn }),
  }
}

/**
 * The state of a shop: a network, two servers, a database whose password is sensitive, a role and a cache in a module.
 * The dependencies are all of them, as Terraform keeps them in a state.
 */
export const SHOP_STATE = JSON.stringify({
  format_version: '1.0',
  terraform_version: '1.9.5',
  values: {
    outputs: { db_password: { sensitive: true, value: 'hunter2' } },
    root_module: {
      resources: [
        resource({ address: 'aws_vpc.main', values: { id: 'vpc-0a1b', cidr_block: '10.0.0.0/16', tags: { Name: 'shop' } }, sensitive: { tags: {} } }),
        resource({
          address: 'aws_subnet.private[0]',
          values: { cidr_block: '10.0.1.0/24', availability_zone: 'eu-central-1a', vpc_id: 'vpc-0a1b' },
          dependsOn: ['aws_vpc.main'],
        }),
        resource({
          address: 'aws_subnet.private[1]',
          values: { cidr_block: '10.0.2.0/24', availability_zone: 'eu-central-1b', vpc_id: 'vpc-0a1b' },
          dependsOn: ['aws_vpc.main'],
        }),
        resource({ address: 'aws_security_group.web', values: { name: 'shop-web', vpc_id: 'vpc-0a1b' }, dependsOn: ['aws_vpc.main'] }),
        resource({ address: 'data.aws_ami.ubuntu', data: true, values: { id: 'ami-0c55', name: 'ubuntu-24.04' } }),
        resource({ address: 'aws_iam_role.app', values: { name: 'shop-app', assume_role_policy: '{"Version":"2012-10-17"}' } }),
        ...[0, 1].map((index) =>
          resource({
            address: `aws_instance.web[${index}]`,
            values: { ami: 'ami-0c55', instance_type: 't3.micro', availability_zone: 'eu-central-1a', user_data: 'echo secret' },
            dependsOn: ['aws_iam_role.app', 'aws_security_group.web', 'aws_subnet.private', 'aws_vpc.main', 'data.aws_ami.ubuntu'],
          }),
        ),
        resource({
          address: 'aws_db_instance.main',
          values: {
            identifier: 'shop',
            engine: 'postgres',
            engine_version: '16.3',
            instance_class: 'db.t3.micro',
            allocated_storage: 20,
            username: 'db-admin-user',
            password: 'hunter2',
          },
          sensitive: { password: true },
          dependsOn: ['aws_security_group.web', 'aws_vpc.main'],
        }),
      ],
      child_modules: [
        {
          address: 'module.cache',
          resources: [
            resource({
              address: 'module.cache.aws_elasticache_cluster.this',
              values: { cluster_id: 'shop-cache', engine: 'redis', engine_version: '7.1', node_type: 'cache.t3.micro' },
              dependsOn: ['aws_security_group.web', 'aws_vpc.main'],
            }),
          ],
        },
      ],
    },
  },
})

/**
 * A plan of a shop: a server and a balancer in the subnet of the module `network`, a policy that reads a bucket through
 * a data source, a service in the module `app` with a database in its module `db`, a reference to a local value, a
 * server the plan deletes and a sensitive variable.
 */
export const SHOP_PLAN = JSON.stringify({
  format_version: '1.2',
  terraform_version: '1.9.5',
  variables: { db_password: { value: 'hunter2' } },
  planned_values: {
    root_module: {
      resources: [
        resource({ address: 'aws_instance.app', values: { ami: 'ami-1', instance_type: 't3.small' } }),
        resource({ address: 'aws_s3_bucket.files', values: { bucket: 'shop-files', region: 'eu-central-1' } }),
        resource({ address: 'aws_iam_policy.read', values: { name: 'read-files' } }),
        resource({ address: 'aws_lb.web', values: { name: 'web', load_balancer_type: 'application', internal: false } }),
      ],
      child_modules: [
        {
          address: 'module.network',
          resources: [
            resource({ address: 'module.network.aws_vpc.this', values: { cidr_block: '10.1.0.0/16' } }),
            resource({ address: 'module.network.aws_subnet.this', values: { cidr_block: '10.1.1.0/24' } }),
          ],
        },
        {
          address: 'module.app',
          resources: [resource({ address: 'module.app.aws_ecs_service.api', values: { name: 'api', desired_count: 2 } })],
          child_modules: [
            {
              address: 'module.app.module.db',
              resources: [
                resource({
                  address: 'module.app.module.db.aws_rds_cluster.main',
                  values: { cluster_identifier: 'shop', engine: 'aurora-postgresql', engine_version: '16.4', master_password: 'hunter2' },
                  sensitive: { master_password: true },
                }),
              ],
            },
          ],
        },
      ],
    },
  },
  resource_changes: [
    { address: 'aws_instance.app', mode: 'managed', type: 'aws_instance', name: 'app', change: { actions: ['create'], after_sensitive: {} } },
    { address: 'aws_s3_bucket.files', mode: 'managed', type: 'aws_s3_bucket', name: 'files', change: { actions: ['no-op'], after_sensitive: {} } },
    {
      address: 'aws_instance.legacy',
      mode: 'managed',
      type: 'aws_instance',
      name: 'legacy',
      change: { actions: ['delete'], before: { instance_type: 't2.micro' }, after: null, after_sensitive: false },
    },
  ],
  prior_state: {
    format_version: '1.0',
    values: {
      root_module: {
        resources: [
          resource({ address: 'aws_s3_bucket.files', values: { bucket: 'shop-files' } }),
          resource({ address: 'aws_instance.legacy', values: { instance_type: 't2.micro' } }),
        ],
      },
    },
  },
  configuration: {
    provider_config: { aws: { name: 'aws', full_name: AWS } },
    root_module: {
      resources: [
        {
          address: 'aws_instance.app',
          mode: 'managed',
          type: 'aws_instance',
          name: 'app',
          expressions: {
            ami: { constant_value: 'ami-1' },
            subnet_id: { references: ['module.network.subnet_id', 'module.network'] },
            tags: { references: ['local.tags'] },
          },
        },
        { address: 'aws_s3_bucket.files', mode: 'managed', type: 'aws_s3_bucket', name: 'files', expressions: { bucket: { constant_value: 'shop-files' } } },
        {
          address: 'data.aws_iam_policy_document.read',
          mode: 'data',
          type: 'aws_iam_policy_document',
          name: 'read',
          expressions: { statement: [{ resources: { references: ['aws_s3_bucket.files.arn', 'aws_s3_bucket.files'] } }] },
        },
        {
          address: 'aws_iam_policy.read',
          mode: 'managed',
          type: 'aws_iam_policy',
          name: 'read',
          expressions: { policy: { references: ['data.aws_iam_policy_document.read.json', 'data.aws_iam_policy_document.read'] } },
        },
        {
          address: 'aws_lb.web',
          mode: 'managed',
          type: 'aws_lb',
          name: 'web',
          expressions: { subnets: { references: ['module.network.subnet_id', 'module.network'] } },
        },
        { address: 'aws_instance.legacy', mode: 'managed', type: 'aws_instance', name: 'legacy', count_expression: { constant_value: 0 } },
      ],
      module_calls: {
        network: {
          source: './modules/network',
          module: {
            outputs: { subnet_id: { expression: { references: ['aws_subnet.this.id', 'aws_subnet.this'] } } },
            resources: [
              { address: 'aws_vpc.this', mode: 'managed', type: 'aws_vpc', name: 'this', expressions: { cidr_block: { constant_value: '10.1.0.0/16' } } },
              { address: 'aws_subnet.this', mode: 'managed', type: 'aws_subnet', name: 'this', expressions: { vpc_id: { references: ['aws_vpc.this.id', 'aws_vpc.this'] } } },
            ],
          },
        },
        app: {
          source: './modules/app',
          expressions: {
            subnet_id: { references: ['module.network.subnet_id', 'module.network'] },
            db_password: { references: ['var.db_password'] },
          },
          module: {
            variables: { subnet_id: {}, db_password: { sensitive: true } },
            resources: [
              {
                address: 'aws_ecs_service.api',
                mode: 'managed',
                type: 'aws_ecs_service',
                name: 'api',
                expressions: { network_configuration: [{ subnets: { references: ['var.subnet_id'] } }] },
              },
            ],
            module_calls: {
              db: {
                source: './db',
                expressions: { password: { references: ['var.db_password'] } },
                module: {
                  resources: [
                    {
                      address: 'aws_rds_cluster.main',
                      mode: 'managed',
                      type: 'aws_rds_cluster',
                      name: 'main',
                      expressions: { master_password: { references: ['var.password'] } },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  },
})

/** A state with a role, a server and a balancer in each instance of the module `app`, with keys of `for_each`. */
export const REGIONS_STATE = JSON.stringify({
  format_version: '1.0',
  values: {
    root_module: {
      child_modules: ['eu', 'us'].map((region) => ({
        address: `module.app["${region}"]`,
        resources: [
          resource({ address: `module.app["${region}"].aws_instance.web[0]`, values: { instance_type: 't3.micro' } }),
          resource({ address: `module.app["${region}"].aws_lb.web`, values: { load_balancer_type: 'network' }, dependsOn: ['module.app.aws_instance.web'] }),
        ],
      })),
    },
  },
})

/** A state with a database whose secrets Terraform marks, a random password and a bucket whose very name is sensitive. */
export const SECRET_STATE = JSON.stringify({
  format_version: '1.0',
  values: {
    root_module: {
      resources: [
        resource({
          address: 'aws_db_instance.main',
          values: { engine: 'postgres', engine_version: '16.3', username: 'db-admin-user', password: 'hunter2' },
          sensitive: { password: true },
          dependsOn: ['random_password.db'],
        }),
        resource({ address: 'random_password.db', values: { length: 24, result: 'S3cr3t-x9!' }, sensitive: { result: true } }),
        resource({ address: 'aws_s3_bucket.secret', values: { bucket: 'top-secret-bucket', region: 'eu-central-1' }, sensitive: { bucket: true } }),
      ],
    },
  },
})

/** A state of a server that depends on a security group the state no longer has. */
export const MISSING_STATE = JSON.stringify({
  format_version: '1.0',
  values: {
    root_module: {
      resources: [
        resource({ address: 'aws_vpc.main', values: { cidr_block: '10.0.0.0/16' } }),
        resource({ address: 'aws_instance.web', values: { instance_type: 't3.micro' }, dependsOn: ['aws_security_group.legacy', 'aws_vpc.main'] }),
      ],
    },
  },
})

/** A stack of a network alone, for a test of several stacks. */
export const NETWORK_STATE = JSON.stringify({
  format_version: '1.0',
  values: { root_module: { resources: [resource({ address: 'aws_vpc.main', values: { cidr_block: '10.0.0.0/16' } })] } },
})

/** `terraform.tfstate` as it lies on a disk: no output of `terraform show -json`. */
export const RAW_STATE = JSON.stringify({ version: 4, terraform_version: '1.9.5', serial: 3, lineage: 'f1b2', outputs: {}, resources: [] })

export const HCL_CONFIG = 'terraform {\n  required_version = ">= 1.6"\n}\n\nresource "aws_instance" "web" {\n  ami = "ami-1"\n}\n'
