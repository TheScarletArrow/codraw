import { days, LegalPage, Operator } from './LegalPage.tsx'

/** What CoDraw does with personal data, as it really does it; the settings of the installation come from the backend. */
export function PrivacyPage() {
  return (
    <LegalPage title="Политика конфиденциальности" other={{ to: '/terms', title: 'Условия использования' }}>
      {(legal) => (
        <>
          <section aria-labelledby="privacy-operator">
            <h2 id="privacy-operator">Кто обрабатывает данные</h2>
            <p className="mt-2">
              CoDraw — редактор диаграмм для совместной работы. Эта установка CoDraw работает на серверах её оператора,
              он и обрабатывает данные её пользователей.
            </p>
            <div className="mt-2">
              <Operator legal={legal} />
            </div>
          </section>

          <section aria-labelledby="privacy-data">
            <h2 id="privacy-data">Какие данные мы обрабатываем</h2>
            <ul>
              <li>
                <strong>Учётная запись.</strong> При входе через GitHub или Google — имя, адрес картинки профиля и
                идентификатор пользователя у этого сервиса. Адрес электронной почты CoDraw не запрашивает, пароль от
                GitHub или Google не получает.
              </li>
              <li>
                <strong>Гостевая учётная запись.</strong> При работе без входа — имя вида «Гость 12», без личных данных.
              </li>
              <li>
                <strong>Доски.</strong> Названия досок, их страницы, фигуры, связи и подписи, сохранённые версии досок, а
                также то, какие чужие доски пользователь открывал по ссылке.
              </li>
              <li>
                <strong>Присутствие.</strong> Имя, цвет, положение курсора и выделение участника видят другие участники
                той же доски, пока он на ней; это не сохраняется.
              </li>
              <li>
                <strong>Технические данные.</strong> Cookie (см. ниже), сетевой адрес и браузер — в журналах запросов
                сервера, а адрес — ещё и на короткое время в памяти сервера, чтобы ограничивать число новых гостей и
                отчётов об ошибках с одного адреса.
              </li>
              <li>
                <strong>Отчёты об ошибках.</strong> Если в браузере происходит ошибка CoDraw, сервер получает её текст,
                место в коде, адрес страницы без параметров и сведения о браузере. Содержимого досок в отчётах нет.
              </li>
            </ul>
          </section>

          <section aria-labelledby="privacy-purposes">
            <h2 id="privacy-purposes">Зачем</h2>
            <p className="mt-2">
              Чтобы вы могли войти, создавать доски и работать над ними вместе с другими; чтобы защищать сервис от
              злоупотреблений и перегрузки; чтобы находить и исправлять ошибки. Мы не используем данные для рекламы и не
              составляем профили пользователей.
            </p>
          </section>

          <section aria-labelledby="privacy-cookies">
            <h2 id="privacy-cookies">Cookie</h2>
            <p className="mt-2">CoDraw ставит только cookie, без которых сервис не работает:</p>
            <ul>
              <li>
                <code>SESSION</code> — сеанс: помнит, что вы вошли. У гостя хранится {days(legal.guestSessionDays)} с
                последнего обращения.
              </li>
              <li>
                <code>XSRF-TOKEN</code> — защита от подделки запросов с чужих сайтов.
              </li>
            </ul>
            <p className="mt-2">
              Аналитики, рекламы и сторонних трекеров в CoDraw нет, данных в хранилище браузера он не держит, поэтому
              согласие на cookie не запрашивается.
            </p>
          </section>

          <section aria-labelledby="privacy-retention">
            <h2 id="privacy-retention">Сколько хранятся данные</h2>
            <ul>
              <li>Учётная запись и доски — пока вы не удалите доски или не попросите удалить учётную запись.</li>
              <li>
                Гость, который не возвращался {days(legal.guestSessionDays)}, вернуться уже не может; его доски
                удаляются, когда с ними {days(legal.guestBoardRetentionDays)} никто не работал, а затем удаляется и сам
                гость.
              </li>
              <li>У каждой доски хранятся не больше {legal.versionsPerBoard} последних версий.</li>
              <li>Журналы сервера — столько, сколько их хранит оператор.</li>
            </ul>
          </section>

          <section aria-labelledby="privacy-recipients">
            <h2 id="privacy-recipients">Кому передаются данные</h2>
            <p className="mt-2">
              GitHub и Google узнают о входе через них по своим правилам. Участники доски видят её содержимое и
              присутствие друг друга. Больше никому данные не передаются и не продаются.
            </p>
          </section>

          <section aria-labelledby="privacy-rights">
            <h2 id="privacy-rights">Ваши права</h2>
            <p className="mt-2">
              Вы можете узнать, какие данные о вас хранятся, исправить их, получить их копию или потребовать их удаления,
              а также отозвать согласие на обработку, написав оператору. Свои доски вы удаляете сами, а содержимое любой
              доски можно выгрузить в <code>.drawio</code>.
            </p>
          </section>

          <section aria-labelledby="privacy-changes">
            <h2 id="privacy-changes">Изменения политики</h2>
            <p className="mt-2">
              Если CoDraw начнёт обрабатывать данные иначе, эта страница изменится, а дата вверху покажет когда.
            </p>
          </section>
        </>
      )}
    </LegalPage>
  )
}
