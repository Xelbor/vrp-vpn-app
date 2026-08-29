import React, { lazy, Suspense } from 'react'
import { Navigate } from 'react-router-dom'
import Home from '@renderer/pages/home'

// Home is the landing route, so it stays in the entry chunk. Every other page is
// split out: statically importing all of them pulled the whole app graph in
// before first paint.
const lazyPage = (
  loader: () => Promise<{ default: React.ComponentType }>
): React.ReactElement => {
  const Page = lazy(loader)
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  )
}

const routes = [
  {
    path: '/mihomo',
    element: lazyPage(() => import('@renderer/pages/mihomo'))
  },
  {
    path: '/sysproxy',
    element: lazyPage(() => import('@renderer/pages/syspeoxy'))
  },
  {
    path: '/tun',
    element: lazyPage(() => import('@renderer/pages/tun'))
  },
  {
    path: '/proxies',
    element: lazyPage(() => import('@renderer/pages/proxies'))
  },
  {
    path: '/rules',
    element: lazyPage(() => import('@renderer/pages/rules'))
  },
  {
    path: '/resources',
    element: lazyPage(() => import('@renderer/pages/resources'))
  },
  {
    path: '/dns',
    element: lazyPage(() => import('@renderer/pages/dns'))
  },
  {
    path: '/sniffer',
    element: lazyPage(() => import('@renderer/pages/sniffer'))
  },
  {
    path: '/logs',
    element: lazyPage(() => import('@renderer/pages/logs'))
  },
  {
    path: '/connections',
    element: lazyPage(() => import('@renderer/pages/connections'))
  },
  {
    path: '/profiles',
    element: lazyPage(() => import('@renderer/pages/profiles'))
  },
  {
    path: '/settings',
    element: lazyPage(() => import('@renderer/pages/settings'))
  },
  {
    path: '/',
    element: <Navigate to="/home" />
  },
  {
    path: '/home',
    element: <Home />
  }
]

export default routes
