import { describe, expect, it } from 'vitest'
import { resourceKind } from './resourceKind.ts'

describe('resourceKind', () => {
  it('knows the resources of the clouds by their exact types', () => {
    expect(resourceKind('aws_db_instance')).toBe('database')
    expect(resourceKind('google_sql_database_instance')).toBe('database')
    expect(resourceKind('azurerm_postgresql_flexible_server')).toBe('database')
    expect(resourceKind('yandex_mdb_postgresql_cluster')).toBe('database')
    expect(resourceKind('aws_elasticache_replication_group')).toBe('cache')
    expect(resourceKind('aws_sqs_queue')).toBe('queue')
    expect(resourceKind('aws_msk_cluster')).toBe('event-topic')
    expect(resourceKind('google_storage_bucket')).toBe('object-storage')
    expect(resourceKind('aws_opensearch_domain')).toBe('search-index')
    expect(resourceKind('google_bigquery_dataset')).toBe('data-warehouse')
    expect(resourceKind('aws_lb')).toBe('load-balancer')
    expect(resourceKind('aws_apigatewayv2_api')).toBe('api-gateway')
    expect(resourceKind('aws_cloudfront_distribution')).toBe('cdn')
    expect(resourceKind('aws_route53_record')).toBe('dns')
    expect(resourceKind('aws_security_group')).toBe('firewall')
    expect(resourceKind('yandex_compute_instance')).toBe('server')
    expect(resourceKind('aws_eks_cluster')).toBe('container')
    expect(resourceKind('aws_lambda_function')).toBe('function')
    expect(resourceKind('google_cloud_scheduler_job')).toBe('scheduler')
    expect(resourceKind('azurerm_linux_web_app')).toBe('service')
  })

  it('has no shape for a type it does not know, nor for one next to a known type', () => {
    expect(resourceKind('aws_iam_role')).toBeNull()
    expect(resourceKind('aws_db_subnet_group')).toBeNull()
    expect(resourceKind('random_password')).toBeNull()
  })

  it('tells a database by its engine and a container of Docker by its image', () => {
    expect(resourceKind('digitalocean_database_cluster', new Map([['engine', 'redis']]))).toBe('cache')
    expect(resourceKind('digitalocean_database_cluster', new Map([['engine', 'pg']]))).toBe('database')
    expect(resourceKind('aws_rds_cluster', new Map([['engine', 'aurora-postgresql']]))).toBe('database')
    expect(resourceKind('docker_container', new Map([['image', 'rabbitmq:4-management']]))).toBe('queue')
    expect(resourceKind('docker_container', new Map([['image', 'ghcr.io/shop/api:1']]))).toBe('container')
  })
})
