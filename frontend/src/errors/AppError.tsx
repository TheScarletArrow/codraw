import { Button } from '@/components/ui/button'

/** Shown instead of a page that broke while it was drawn: React Router reports the error to the root of React. */
export function AppError() {
  return (
    <div role="alert" className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Что-то пошло не так</h1>
      <p className="max-w-md text-muted-foreground">
        Страница не смогла отрисоваться. Мы уже получили отчёт об ошибке. Изменения на досках сохраняются сами, так что
        обновить страницу безопасно.
      </p>
      <Button type="button" onClick={() => location.reload()}>
        Обновить страницу
      </Button>
    </div>
  )
}
