import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import './styles.css'
import './styles-student.css'
import './styles-student-purple.css'
import './styles-counselor.css'
import './styles-dorm.css'
import './styles-contract-demo.css'

async function bootstrap() {
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    try {
      const { worker } = await import('./mocks/browser')
      await worker.start({
        onUnhandledFrame: 'bypass',
        serviceWorker: { url: '/mockServiceWorker.js' },
      })
      console.info('[MSW] Mock 已启动，仅接管带 X-Contract-Demo 标记的请求。')
    } catch (error) {
      console.warn('[MSW] Mock 启动失败，应用将继续使用真实后端。', error)
    }
  } else if ('serviceWorker' in navigator) {
    // 从 Mock 切回真实后端时，清掉上一次注册的 MSW worker，避免旧缓存继续拦截。
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(
        registrations
          .filter((registration) => registration.active?.scriptURL.includes('mockServiceWorker'))
          .map((registration) => registration.unregister()),
      )
    } catch (error) {
      console.warn('[MSW] 清理旧 worker 失败，请手动在 DevTools > Application 中注销。', error)
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  )
}

bootstrap()
