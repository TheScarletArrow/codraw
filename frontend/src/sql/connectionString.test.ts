import { describe, expect, it } from 'vitest'
import { parseConnectionString } from './connectionString.ts'

describe('connection strings', () => {
  it('reads URLs of PgJDBC with the user, the password, SSL and the schema in parameters', () => {
    expect(parseConnectionString('jdbc:postgresql://db.internal:6432/shop?user=reader&password=p%40ss&sslmode=verify-full&currentSchema=app,public')).toEqual({
      host: 'db.internal',
      port: 6432,
      database: 'shop',
      user: 'reader',
      password: 'p@ss',
      sslMode: 'verify-full',
      schema: 'app',
    })
    expect(parseConnectionString('jdbc:postgresql://db1:5432,db2:5433/shop?ssl=true')).toEqual({ host: 'db1', port: 5432, database: 'shop', sslMode: 'require' })
    expect(parseConnectionString('jdbc:postgresql://[fd00::7]/shop')).toEqual({ host: 'fd00::7', database: 'shop' })
  })

  it('reads URIs of libpq with the user and the password before the host', () => {
    expect(parseConnectionString(' postgresql://reader:s3cr@t@db.internal/shop%20db?sslmode=require ')).toEqual({
      host: 'db.internal',
      database: 'shop db',
      user: 'reader',
      password: 's3cr@t',
      sslMode: 'require',
    })
    expect(parseConnectionString('postgres://reader@localhost')).toEqual({ host: 'localhost', user: 'reader' })
    expect(parseConnectionString('postgresql://db.internal/shop?sslmode=allow')).toMatchObject({ sslMode: 'prefer' })
    expect(parseConnectionString('postgresql://db.internal/shop?sslmode=verify-ca')).toMatchObject({ sslMode: 'verify-full' })
  })

  it('reads keywords of libpq, values in quotes too', () => {
    expect(parseConnectionString("host=::1 port=5433 dbname='my shop' user=reader password='it\\'s' sslmode=disable")).toEqual({
      host: '::1',
      port: 5433,
      database: 'my shop',
      user: 'reader',
      password: "it's",
      sslMode: 'disable',
    })
  })

  it('drops parameters that are not the connection itself', () => {
    expect(
      parseConnectionString(
        'jdbc:postgresql://db.internal/shop?socketFactory=org.example.Evil&sslfactory=x&loggerFile=/tmp/log&connectTimeout=1&options=-c%20x=1',
      ),
    ).toEqual({ host: 'db.internal', database: 'shop' })
    expect(parseConnectionString('host=db.internal dbname=shop sslrootcert=/etc/x service=evil')).toEqual({ host: 'db.internal', database: 'shop' })
  })

  it('is not a connection string otherwise', () => {
    for (const text of ['', 'db.internal:5432/shop', 'mysql://db/shop', 'CREATE TABLE users (id int);', 'port=5432', 'host=db and more']) {
      expect(parseConnectionString(text), text).toBeNull()
    }
  })
})
