/** Small, realistic documents of OpenAPI, Swagger and AsyncAPI for the tests of the import. */

/** The Petstore of OpenAPI 3.0: `Pets` is an alias of an array of `Pet`, `Error` comes through `components.responses`. */
export const PETSTORE_YAML = `openapi: 3.0.0
info:
  version: 1.0.0
  title: Petstore
  license:
    name: MIT
servers:
  - url: http://petstore.swagger.io/v1
paths:
  /pets:
    get:
      summary: List all pets
      operationId: listPets
      parameters:
        - name: limit
          in: query
          required: false
          schema:
            type: integer
            format: int32
      responses:
        '200':
          description: A paged array of pets
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pets'
        default:
          $ref: '#/components/responses/Error'
    post:
      summary: Create a pet
      operationId: createPets
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Pet'
      responses:
        '201':
          description: Null response
        default:
          $ref: '#/components/responses/Error'
  /pets/{petId}:
    get:
      summary: Info for a specific pet
      operationId: showPetById
      parameters:
        - name: petId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Expected response to a valid request
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pet'
        default:
          $ref: '#/components/responses/Error'
components:
  schemas:
    Pet:
      type: object
      required:
        - id
        - name
      properties:
        id:
          type: integer
          format: int64
        name:
          type: string
        tag:
          type: string
    Pets:
      type: array
      maxItems: 100
      items:
        $ref: '#/components/schemas/Pet'
    Error:
      type: object
      required:
        - code
        - message
      properties:
        code:
          type: integer
          format: int32
        message:
          type: string
  responses:
    Error:
      description: unexpected error
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
`

/** A pet store of OpenAPI 3.1 in JSON: arrays of models, a model in a model, `null` among the types. */
export const PETSTORE_JSON = JSON.stringify(
  {
    openapi: '3.1.0',
    info: { title: 'Pet Store', version: '2.0.0' },
    paths: {
      '/pets/{petId}': {
        get: {
          responses: { '200': { description: 'A pet', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
        },
        delete: { responses: { '204': { description: 'Deleted' } } },
      },
    },
    components: {
      schemas: {
        Pet: {
          type: 'object',
          required: ['id', 'name', 'category'],
          properties: {
            id: { type: 'integer', format: 'int64' },
            name: { type: 'string' },
            category: { $ref: '#/components/schemas/Category' },
            tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' } },
            photoUrls: { type: 'array', items: { type: 'string', format: 'uri' } },
            status: { type: ['string', 'null'], enum: ['available', 'pending', 'sold', null] },
          },
        },
        Category: {
          type: 'object',
          properties: { id: { type: 'integer', format: 'int64' }, name: { type: 'string' }, parent: { $ref: '#/components/schemas/Category' } },
        },
        Tag: { type: 'object', properties: { id: { type: 'integer', format: 'int64' }, name: { type: 'string' } } },
      },
    },
  },
  null,
  2,
)

/** Models of OpenAPI 3.1 with what makes types and references hard: aliases, compositions, loops, references out of the file. */
export const STORE_YAML = `openapi: 3.1.0
info:
  title: Store
  version: '2.0'
paths:
  /orders:
    post:
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Order'
      responses:
        '200':
          description: The order
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/Order'
components:
  schemas:
    Order:
      type: object
      required: [id, items, customer, coupon]
      properties:
        id:
          type: string
          format: uuid
        items:
          type: array
          minItems: 1
          items:
            $ref: '#/components/schemas/LineItem'
        customer:
          $ref: '#/components/schemas/Customer'
        coupon:
          oneOf:
            - $ref: '#/components/schemas/Coupon'
            - type: 'null'
        status:
          $ref: '#/components/schemas/Status'
        note:
          type: [string, 'null']
        metadata:
          type: object
          additionalProperties:
            type: string
        price:
          $ref: './common.yaml#/components/schemas/Money'
        x-trace-id:
          type: string
    LineItem:
      type: object
      properties:
        sku:
          type: string
        quantity:
          type: integer
          format: int32
    Customer:
      type: object
      required: [email]
      properties:
        email:
          type: string
          format: email
        referrer:
          $ref: '#/components/schemas/Customer'
    Coupon:
      type: object
      properties:
        code:
          type: string
    Status:
      type: string
      enum: [new, paid, shipped]
    GiftOrder:
      allOf:
        - $ref: '#/components/schemas/Order'
        - type: object
          required: [message]
          properties:
            message:
              type: string
    Payment:
      oneOf:
        - $ref: '#/components/schemas/Card'
        - $ref: '#/components/schemas/Transfer'
    Card:
      properties:
        number:
          type: string
    Transfer:
      properties:
        iban:
          type: string
    Loop1:
      $ref: '#/components/schemas/Loop2'
    Loop2:
      $ref: '#/components/schemas/Loop1'
    Broken:
      properties:
        missing:
          $ref: '#/components/schemas/Nowhere'
        loop:
          $ref: '#/components/schemas/Loop1'
`

/** Swagger 2.0: models in `definitions`, the body of a request as a parameter. */
export const SWAGGER_YAML = `swagger: '2.0'
info:
  title: Users
  version: '1.0'
basePath: /v1
paths:
  /users:
    get:
      responses:
        '200':
          description: The users
          schema:
            type: array
            items:
              $ref: '#/definitions/User'
    post:
      parameters:
        - in: body
          name: user
          schema:
            $ref: '#/definitions/NewUser'
      responses:
        '201':
          description: Created
definitions:
  User:
    type: object
    properties:
      id:
        type: integer
        format: int64
      name:
        type: string
  NewUser:
    properties:
      name:
        type: string
`

/** AsyncAPI 2.6: `subscribe` is what the service sends, `publish` what it receives. */
export const ACCOUNT_ASYNCAPI_YAML = `asyncapi: 2.6.0
info:
  title: Account Service
  version: 1.0.0
channels:
  user/signedup:
    subscribe:
      operationId: sendUserSignedUp
      message:
        $ref: '#/components/messages/UserSignedUp'
  user/deleted:
    publish:
      operationId: onUserDeleted
      message:
        name: UserDeleted
        payload:
          type: object
          properties:
            userId:
              type: string
  user/events:
    publish:
      message:
        oneOf:
          - $ref: '#/components/messages/UserSignedUp'
          - $ref: '#/components/messages/UserRenamed'
components:
  messages:
    UserSignedUp:
      payload:
        $ref: '#/components/schemas/User'
    UserRenamed:
      name: userRenamed
      schemaFormat: application/vnd.apache.avro;version=1.9.0
      payload:
        type: record
        name: UserRenamed
  schemas:
    User:
      type: object
      properties:
        displayName:
          type: string
        email:
          type: string
          format: email
`

/** AsyncAPI 3.0 of a service that sends `OrderCreated` to `orders.created`. */
export const ORDERS_ASYNCAPI_YAML = `asyncapi: 3.0.0
info:
  title: Orders
  version: 1.0.0
  description: |
    Заказы магазина:
    создание и отмена.

    Подробности — в вики.
servers:
  production:
    host: kafka.example.com:9093
    protocol: kafka-secure
  local:
    host: localhost:9092
    protocol: kafka
channels:
  orderCreated:
    address: orders.created
    messages:
      OrderCreated:
        $ref: '#/components/messages/OrderCreated'
  orderEvents:
    address: null
operations:
  publishOrderCreated:
    action: send
    channel:
      $ref: '#/channels/orderCreated'
    messages:
      - $ref: '#/channels/orderCreated/messages/OrderCreated'
components:
  messages:
    OrderCreated:
      name: OrderCreated
      payload:
        $ref: '#/components/schemas/OrderCreatedPayload'
  schemas:
    OrderCreatedPayload:
      type: object
      properties:
        orderId:
          type: string
          format: uuid
        total:
          type: number
`

/** AsyncAPI 3.0 of a service that receives what Orders sends and sends `InvoiceIssued`. */
export const BILLING_ASYNCAPI_YAML = `asyncapi: 3.0.0
info:
  title: Billing
  version: 1.0.0
channels:
  ordersCreated:
    address: orders.created
    messages:
      OrderCreated:
        name: OrderCreated
        payload:
          schemaFormat: application/vnd.aai.asyncapi+json;version=3.0.0
          schema:
            $ref: '#/components/schemas/OrderCreatedPayload'
  invoiceIssued:
    address: invoices.issued
    messages:
      InvoiceIssued:
        payload:
          type: object
          properties:
            invoiceId:
              type: string
operations:
  onOrderCreated:
    action: receive
    channel:
      $ref: '#/channels/ordersCreated'
  issueInvoice:
    action: send
    channel:
      $ref: '#/channels/invoiceIssued'
components:
  schemas:
    OrderCreatedPayload:
      type: object
      properties:
        orderId:
          type: string
          format: uuid
        total:
          type: number
`
