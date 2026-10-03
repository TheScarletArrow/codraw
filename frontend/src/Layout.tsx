import { Link, Outlet } from 'react-router'

export function Layout() {
  return (
    <>
      <header className="app-header">
        <Link to="/" className="logo">
          CoDraw
        </Link>
      </header>
      <main className="app">
        <Outlet />
      </main>
    </>
  )
}
