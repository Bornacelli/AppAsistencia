# Asistencia Juvenil

App de control de asistencia para grupos juveniles de iglesia. Construida con React + Vite + Firebase.

## Stack

- **Frontend:** React 18 + Vite 5
- **Estilos:** Tailwind CSS
- **Base de datos:** Firebase Firestore
- **Autenticación:** Firebase Authentication
- **Iconos:** Phosphor Icons
- **Gráficas:** Recharts
- **Exportación Excel:** SheetJS (xlsx)
- **PWA:** vite-plugin-pwa (instalable en Android/iOS)

---

## Instalación

```bash
npm install
```

---

## Configuración

1. Copia `.env.example` a `.env`
2. Llena las variables con las credenciales de tu proyecto Firebase:

```env
VITE_FIREBASE_API_KEY=tu_api_key
VITE_FIREBASE_AUTH_DOMAIN=tu_proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu_proyecto
VITE_FIREBASE_STORAGE_BUCKET=tu_proyecto.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
VITE_FIREBASE_APP_ID=tu_app_id
```

---

## Desarrollo local

```bash
npm run dev
```

La app estará disponible en `http://localhost:5173`

---

## Build para producción

```bash
npm run build
```

Los archivos de producción quedan en la carpeta `dist/`.

---

## Despliegue en Vercel

1. Conecta tu repositorio de GitHub con Vercel
2. Vercel detecta automáticamente que es un proyecto Vite
3. Agrega las variables de entorno en Vercel Dashboard → Settings → Environment Variables
4. Cada `git push` a `main` desplegará automáticamente

O usa el CLI:
```bash
npm install -g vercel
vercel --prod
```

---

## Reglas de Firestore

Copia el contenido de `firestore.rules` en Firebase Console → Firestore → Reglas.

---

## Crear el primer administrador

Debido a que no hay registro público, el primer admin se crea manualmente:

1. Ve a [Firebase Console](https://console.firebase.google.com) → Authentication → Agregar usuario
2. Ingresa el email y contraseña del administrador
3. Copia el UID generado (visible en la tabla de usuarios)
4. Ve a Firestore → Crear documento en la colección `leaders` con ID = el UID copiado:

```json
{
  "name": "Nombre del Admin",
  "email": "admin@tuiglesia.com",
  "role": "admin",
  "groupIds": [],
  "active": true,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

5. Abre la app y haz login con las credenciales creadas

**Nota:** Si la colección `leaders` está vacía, la app mostrará una pantalla de "Primera configuración" para crear el admin directamente desde la interfaz.

---

## Estructura del proyecto

```
src/
├── main.jsx              # Punto de entrada
├── App.jsx               # Router principal
├── firebase.js           # Configuración Firebase
├── index.css             # Estilos globales + CSS variables
├── context/
│   ├── AuthContext.jsx   # Auth state global
│   └── ToastContext.jsx  # Notificaciones toast
├── components/
│   ├── ui/               # Componentes reutilizables
│   └── layout/           # Layout (TopBar, BottomNav, ProtectedRoute)
├── pages/
│   ├── Login.jsx
│   ├── SetupAdmin.jsx
│   ├── Dashboard.jsx
│   ├── Attendance.jsx
│   ├── Members.jsx
│   ├── MemberForm.jsx
│   ├── MemberProfile.jsx
│   ├── Leaders.jsx
│   ├── History.jsx
│   ├── Reports.jsx
│   ├── Alerts.jsx
│   └── Settings.jsx
└── utils/
    ├── dates.js          # Helpers de fechas
    └── excel.js          # Exportación Excel
```

---

## Roles

| Rol | Descripción |
|-----|-------------|
| `admin` | Acceso total. Puede crear líderes y asistentes. |
| `leader` | Solo sus grupos. Puede crear asistentes para sus grupos. |
| `assistant` | Igual que líder en funciones del día a día. |

---

## Datos existentes del MVP

Los datos (miembros y asistencias) guardados desde el MVP anterior siguen funcionando sin migración.

- Miembros: compatibles directamente
- Asistencias antiguas: se muestran en historial. Si no tienen `groupId`, aparecen solo en la vista de admin.
