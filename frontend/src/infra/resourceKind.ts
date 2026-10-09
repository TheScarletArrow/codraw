import { imageKind, type ImageKind } from './imageKind.ts'

/** What a resource of Terraform is, as its type tells; each is a shape of the palette. */
export type ResourceKind =
  | ImageKind
  | 'cdn'
  | 'dns'
  | 'firewall'
  | 'server'
  | 'function'
  | 'scheduler'
  | 'service'

/**
 * Types of resources of the providers people deploy with most, by what they are. The types are exact: `aws_db_instance`
 * is a database, but `aws_db_subnet_group` next to it is not.
 */
const KINDS: [ResourceKind, string[]][] = [
  [
    'database',
    [
      'aws_db_instance',
      'aws_rds_cluster',
      'aws_rds_global_cluster',
      'aws_dynamodb_table',
      'aws_docdb_cluster',
      'aws_neptune_cluster',
      'aws_keyspaces_keyspace',
      'google_sql_database_instance',
      'google_spanner_instance',
      'google_bigtable_instance',
      'google_firestore_database',
      'google_alloydb_cluster',
      'azurerm_postgresql_server',
      'azurerm_postgresql_flexible_server',
      'azurerm_mysql_server',
      'azurerm_mysql_flexible_server',
      'azurerm_mariadb_server',
      'azurerm_mssql_server',
      'azurerm_mssql_database',
      'azurerm_cosmosdb_account',
      'yandex_mdb_postgresql_cluster',
      'yandex_mdb_mysql_cluster',
      'yandex_mdb_mongodb_cluster',
      'yandex_ydb_database_serverless',
      'yandex_ydb_database_dedicated',
      'digitalocean_database_cluster',
      'mongodbatlas_cluster',
      'mongodbatlas_advanced_cluster',
    ],
  ],
  [
    'cache',
    [
      'aws_elasticache_cluster',
      'aws_elasticache_replication_group',
      'aws_elasticache_serverless_cache',
      'aws_memorydb_cluster',
      'google_redis_instance',
      'google_memcache_instance',
      'azurerm_redis_cache',
      'yandex_mdb_redis_cluster',
    ],
  ],
  [
    'queue',
    [
      'aws_sqs_queue',
      'aws_mq_broker',
      'google_cloud_tasks_queue',
      'azurerm_servicebus_namespace',
      'azurerm_servicebus_queue',
      'azurerm_storage_queue',
      'yandex_message_queue',
    ],
  ],
  [
    'event-topic',
    [
      'aws_sns_topic',
      'aws_msk_cluster',
      'aws_msk_serverless_cluster',
      'aws_kinesis_stream',
      'aws_kinesis_firehose_delivery_stream',
      'aws_cloudwatch_event_bus',
      'google_pubsub_topic',
      'azurerm_eventhub',
      'azurerm_eventhub_namespace',
      'azurerm_servicebus_topic',
      'azurerm_eventgrid_topic',
      'yandex_mdb_kafka_cluster',
      'confluent_kafka_cluster',
      'confluent_kafka_topic',
    ],
  ],
  [
    'object-storage',
    [
      'aws_s3_bucket',
      'google_storage_bucket',
      'azurerm_storage_account',
      'azurerm_storage_container',
      'yandex_storage_bucket',
      'digitalocean_spaces_bucket',
      'minio_s3_bucket',
    ],
  ],
  [
    'search-index',
    [
      'aws_opensearch_domain',
      'aws_elasticsearch_domain',
      'aws_opensearchserverless_collection',
      'azurerm_search_service',
      'yandex_mdb_opensearch_cluster',
    ],
  ],
  [
    'data-warehouse',
    [
      'aws_redshift_cluster',
      'aws_redshiftserverless_workgroup',
      'google_bigquery_dataset',
      'azurerm_synapse_workspace',
      'yandex_mdb_clickhouse_cluster',
      'snowflake_database',
      'snowflake_warehouse',
    ],
  ],
  [
    'load-balancer',
    [
      'aws_lb',
      'aws_alb',
      'aws_elb',
      'google_compute_forwarding_rule',
      'google_compute_global_forwarding_rule',
      'google_compute_url_map',
      'azurerm_lb',
      'azurerm_application_gateway',
      'yandex_lb_network_load_balancer',
      'yandex_alb_load_balancer',
      'digitalocean_loadbalancer',
      'hcloud_load_balancer',
    ],
  ],
  [
    'api-gateway',
    [
      'aws_api_gateway_rest_api',
      'aws_apigatewayv2_api',
      'google_api_gateway_api',
      'google_api_gateway_gateway',
      'azurerm_api_management',
      'yandex_api_gateway',
      'kubernetes_ingress',
      'kubernetes_ingress_v1',
    ],
  ],
  ['cdn', ['aws_cloudfront_distribution', 'azurerm_cdn_profile', 'azurerm_cdn_frontdoor_profile', 'azurerm_frontdoor', 'yandex_cdn_resource', 'digitalocean_cdn']],
  [
    'dns',
    [
      'aws_route53_zone',
      'aws_route53_record',
      'google_dns_managed_zone',
      'google_dns_record_set',
      'azurerm_dns_zone',
      'azurerm_private_dns_zone',
      'azurerm_dns_a_record',
      'azurerm_dns_cname_record',
      'yandex_dns_zone',
      'yandex_dns_recordset',
      'cloudflare_zone',
      'cloudflare_record',
      'cloudflare_dns_record',
      'digitalocean_domain',
      'digitalocean_record',
    ],
  ],
  [
    'firewall',
    [
      'aws_security_group',
      'aws_network_acl',
      'aws_wafv2_web_acl',
      'aws_networkfirewall_firewall',
      'google_compute_firewall',
      'google_compute_security_policy',
      'azurerm_network_security_group',
      'azurerm_firewall',
      'azurerm_web_application_firewall_policy',
      'yandex_vpc_security_group',
      'digitalocean_firewall',
      'hcloud_firewall',
    ],
  ],
  [
    'server',
    [
      'aws_instance',
      'aws_autoscaling_group',
      'google_compute_instance',
      'google_compute_instance_group_manager',
      'google_compute_region_instance_group_manager',
      'azurerm_linux_virtual_machine',
      'azurerm_windows_virtual_machine',
      'azurerm_virtual_machine',
      'azurerm_linux_virtual_machine_scale_set',
      'azurerm_windows_virtual_machine_scale_set',
      'yandex_compute_instance',
      'yandex_compute_instance_group',
      'digitalocean_droplet',
      'hcloud_server',
      'vsphere_virtual_machine',
      'openstack_compute_instance_v2',
    ],
  ],
  [
    'container',
    [
      'aws_ecs_service',
      'aws_ecs_cluster',
      'aws_eks_cluster',
      'aws_eks_node_group',
      'aws_apprunner_service',
      'google_cloud_run_service',
      'google_cloud_run_v2_service',
      'google_container_cluster',
      'google_container_node_pool',
      'azurerm_kubernetes_cluster',
      'azurerm_kubernetes_cluster_node_pool',
      'azurerm_container_app',
      'azurerm_container_group',
      'yandex_kubernetes_cluster',
      'yandex_kubernetes_node_group',
      'yandex_serverless_container',
      'digitalocean_kubernetes_cluster',
      'digitalocean_app',
      'docker_container',
      'kubernetes_deployment',
      'kubernetes_deployment_v1',
      'kubernetes_stateful_set',
      'kubernetes_stateful_set_v1',
      'kubernetes_daemonset',
      'kubernetes_daemon_set_v1',
      'kubernetes_pod',
      'kubernetes_pod_v1',
      'kubernetes_job',
      'kubernetes_job_v1',
      'kubernetes_cron_job',
      'kubernetes_cron_job_v1',
      'helm_release',
    ],
  ],
  [
    'function',
    [
      'aws_lambda_function',
      'google_cloudfunctions_function',
      'google_cloudfunctions2_function',
      'azurerm_function_app',
      'azurerm_linux_function_app',
      'azurerm_windows_function_app',
      'yandex_function',
    ],
  ],
  ['scheduler', ['aws_cloudwatch_event_rule', 'aws_scheduler_schedule', 'google_cloud_scheduler_job', 'yandex_function_trigger']],
  [
    'service',
    [
      'aws_elastic_beanstalk_environment',
      'google_app_engine_application',
      'azurerm_linux_web_app',
      'azurerm_windows_web_app',
      'azurerm_app_service',
    ],
  ],
]

const BY_TYPE = new Map(KINDS.flatMap(([kind, types]) => types.map((type) => [type, kind] as const)))

/**
 * What a resource of the type is, or `null` for a type CoDraw has no shape for. A database whose `engine` names a cache,
 * a broker or a search engine is that, and a container of Docker is what its image is.
 */
export function resourceKind(type: string, attributes: ReadonlyMap<string, string> = new Map()): ResourceKind | null {
  const kind = BY_TYPE.get(type) ?? null
  const engine = attributes.get('engine')
  if (kind === 'database' && engine) {
    const byEngine = imageKind(engine)
    if (byEngine !== 'container') return byEngine
  }
  const image = attributes.get('image')
  if (type === 'docker_container' && image) return imageKind(image)
  return kind
}
