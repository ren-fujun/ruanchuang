import React from 'react'
import {createRoot} from 'react-dom/client'
import {LogisticsApp} from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LogisticsApp />
  </React.StrictMode>,
)
