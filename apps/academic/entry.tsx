import React from 'react'
import {createRoot} from 'react-dom/client'
import {PortalShell} from '../shared/PortalShell'
import {modules} from './modules'
createRoot(document.getElementById('root')!).render(<PortalShell title="教务处端" modules={modules} />)
