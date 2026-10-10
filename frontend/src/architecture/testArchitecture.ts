/**
 * Architecture as code for the tests of its import: the example «Big Bank plc» of Structurizr and of C4-PlantUML, cut
 * down, a diagram of Mermaid C4 and a small shop.
 */

/** The workspace of Structurizr, with hierarchical identifiers, an enterprise, documentation, deployment and views. */
export const BIG_BANK_DSL = `workspace "Big Bank plc" "This is an example workspace" {
    !identifiers hierarchical
    !docs docs
    model {
        customer = person "Personal Banking Customer" "A customer of the bank, with personal bank accounts." "Customer"
        enterprise "Big Bank plc" {
            supportStaff = person "Customer Service Staff" "Customer service staff within the bank." "Bank Staff"
            mainframe = softwaresystem "Mainframe Banking System" "Stores all of the core banking information." "Existing System"
            email = softwaresystem "E-mail System" "The internal Microsoft Exchange e-mail system." "Existing System"
            internetBankingSystem = softwaresystem "Internet Banking System" "Allows customers to view information." {
                singlePageApplication = container "Single-Page Application" "Provides functionality." "JavaScript and Angular" "Web Browser"
                webApplication = container "Web Application" "Delivers the static content." "Java and Spring MVC"
                apiApplication = container "API Application" "Provides functionality via a JSON/HTTPS API." "Java and Spring MVC" {
                    signinController = component "Sign In Controller" "Allows users to sign in." "Spring MVC Rest Controller"
                    securityComponent = component "Security Component" "Provides functionality." "Spring Bean"
                }
                database = container "Database" "Stores user registration information." "Oracle Database Schema" "Database"
            }
        }
        # relationships between people and software systems
        customer -> internetBankingSystem "Views account balances, and makes payments using"
        internetBankingSystem -> mainframe "Gets account information from, and makes payments using"
        internetBankingSystem -> email "Sends e-mail using"
        email -> customer "Sends e-mails to"
        customer -> supportStaff "Asks questions to" "Telephone"
        // relationships to/from containers
        customer -> internetBankingSystem.webApplication "Visits bigbank.com/ib using" "HTTPS"
        customer -> internetBankingSystem.singlePageApplication "Views account balances, and makes payments using"
        internetBankingSystem.webApplication -> internetBankingSystem.singlePageApplication "Delivers to the customer's web browser"
        /* relationships to/from components,
           written with their full paths */
        internetBankingSystem.singlePageApplication -> internetBankingSystem.apiApplication.signinController "Makes API calls to" "JSON/HTTPS"
        internetBankingSystem.apiApplication.signinController -> internetBankingSystem.apiApplication.securityComponent "Uses"
        internetBankingSystem.apiApplication.securityComponent -> internetBankingSystem.database "Reads from and writes to" "JDBC"
        internetBankingSystem.apiApplication.securityComponent -> mainframe "Makes API calls to" "XML/HTTPS"

        live = deploymentEnvironment "Live" {
            deploymentNode "Customer's computer" "" "Microsoft Windows or Apple macOS" {
                liveSinglePageApplicationInstance = containerInstance internetBankingSystem.singlePageApplication
            }
        }
    }
    views {
        systemlandscape "SystemLandscape" {
            include *
            autoLayout
        }
        styles {
            element "Person" {
                color #ffffff
                shape Person
            }
        }
    }
}
`

/** The diagram of the context of the example of C4-PlantUML. */
export const BIG_BANK_CONTEXT = `@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml
LAYOUT_WITH_LEGEND()
title System Context diagram for Internet Banking System
Person(customer, "Personal Banking Customer", "A customer of the bank, with personal bank accounts.")
System(banking_system, "Internet Banking System", "Allows customers to view information about their bank accounts.")
System_Ext(mail_system, "E-mail system", "The internal Microsoft Exchange e-mail system.")
System_Ext(mainframe, "Mainframe Banking System", "Stores all of the core banking information.")
Rel(customer, banking_system, "Uses")
Rel_Back(customer, mail_system, "Sends e-mails to")
Rel_Neighbor(banking_system, mail_system, "Sends e-mails", "SMTP")
Rel(banking_system, mainframe, "Uses")
@enduml
`

/**
 * The diagram of the containers of the example: `customer` is named otherwise than in the context, and
 * `banking_system` is the mainframe there.
 */
export const BIG_BANK_CONTAINERS = `@startuml
!include <C4/C4_Container>
' the look, which the import leaves out
skinparam wrapWidth 200
skinparam rectangle {
  BackgroundColor white
}
Person(customer, Customer, "A customer of the bank, with personal bank accounts")
System_Boundary(c1, "Internet Banking System") {
    Container(web_app, "Web Application", "Java, Spring MVC", "Delivers the static content and the Internet banking SPA")
    Container(spa, "Single-Page App", "JavaScript, Angular", "Provides all the Internet banking functionality")
    ContainerDb(database, "Database", "SQL Database", "Stores user registration information")
    Container(backend_api, "API Application", "Java, Docker Container", "Provides Internet banking functionality via API")
}
System_Ext(email_system, "E-Mail System", "The internal Microsoft Exchange system")
System_Ext(banking_system, "Mainframe Banking System", "Stores all of the core banking information.")
Rel(customer, web_app, "Uses", "HTTPS")
Rel(customer, spa, "Uses", "HTTPS")
Rel_Neighbor(web_app, spa, "Delivers")
Rel(spa, backend_api, "Uses", "async, JSON/HTTPS")
Rel_Back_Neighbor(database, backend_api, "Reads from and writes to", "sync, JDBC")
Rel_Back(customer, email_system, "Sends e-mails to")
Rel_Back(email_system, backend_api, "Sends e-mails using", "sync, SMTP")
Rel_R(backend_api, banking_system, "Uses", "sync/async, XML/HTTPS")
note right of customer : a note
SHOW_LEGEND()
@enduml
`

/** A diagram of Mermaid C4 with an enterprise, a nested boundary, a queue and a deployment node. */
export const MERMAID_C4 = `C4Container
title Магазин
%% a comment
Person(customer, "Покупатель", "Выбирает товары")
Enterprise_Boundary(company, "Компания") {
    System_Boundary(shop, "Магазин") {
        Container(web, "Сайт", "React", "Каталог и корзина")
        ContainerQueue(events, "События", "Kafka")
        ContainerDb(db, "База", "PostgreSQL")
    }
}
Deployment_Node(cloud, "Облако", "Yandex Cloud") {
    Container(worker, "Обработчик", "Go")
}
Rel(customer, web, "Покупает", "HTTPS")
Rel(web, events, "Публикует")
BiRel(worker, events, "Читает")
UpdateRelStyle(customer, web, $textColor="blue")
UpdateLayoutConfig($c4ShapeInRow="3")
`

/** A small shop of Structurizr: a system with a web site and an API, and a payment system. */
export const SHOP_DSL = `workspace "Магазин" {
    model {
        customer = person "Покупатель"
        shop = softwareSystem "Магазин" {
            web = container "Сайт" "" "React"
            api = container "API" "Заказы" "Spring Boot"
        }
        payments = softwareSystem "Платежи" "" "External"
        customer -> web "Открывает" "HTTPS"
        web -> api "Вызывает" "JSON/HTTPS"
        api -> payments "Проводит оплату"
    }
}
`
