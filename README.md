# OWL ROYALE — dos pilotos, un búho

Minijuego multijugador para navegador. Pueden jugar hasta 8 personas repartidas en 4 equipos (búhos). Cada búho que participe necesita dos pilotos:

- Piloto vertical: controla arriba y abajo.
- Piloto horizontal: controla izquierda y derecha.

Cada piloto juega desde su propio móvil. Ambos controles se combinan en el servidor para mover un único búho. Los móviles muestran el mapa y su joystick; la TV/ordenador puede abrir la vista de pantalla grande sin controles.

## Ejecutar en local

Requisitos: Node.js 18 o superior.

```bash
npm install
npm start
```

Abre `http://localhost:3000`. Al crear una sala, puedes participar como jugador (como hasta ahora) o dejar el dispositivo como visor; el anfitrión puede iniciar la partida desde cualquiera de las dos modalidades. Comparte el código para que se unan los pilotos. Las plazas se asignan automáticamente: vertical y horizontal para cada búho, en orden. La partida puede empezar cuando haya al menos un búho con sus dos pilotos y todas las parejas presentes estén listas; no hace falta ocupar los cuatro equipos.

Todos los pilotos presentes deben pulsar «Estoy listo». Si hay un piloto esperando pareja en otro búho, habrá que completar esa pareja antes de iniciar.

Para usar varios móviles en la misma red Wi-Fi, abre en ellos la dirección local del ordenador que ejecuta el servidor (por ejemplo `http://192.168.1.20:3000`). Para jugar desde redes distintas, despliega el servidor en un hosting Node.js persistente compatible con WebSockets.

## Controles

- Cada móvil recibe un joystick de un solo eje, según la plaza asignada.
- El servidor valida el eje autorizado para cada socket y combina ambos valores por búho.
- Solo compiten los búhos con sus dos pilotos; los equipos sin ocupar no aparecen en la partida.
- La partida empieza sin coleccionables. Cada tipo tiene un temporizador independiente, por lo que varios objetos pueden aparecer y coexistir. Los intervalos aleatorios son: HUEVO (1–2 s), bola (2–3 s), TOKIOHOTEL (3–5 s), txakoli (5–8 s) y miguel (8–12 s).
- Cada objeto tiene su propio tiempo de vida aleatorio de 8–12 segundos y parpadea durante sus últimos 2 segundos; recogerlo no altera el temporizador de aparición de su tipo.
- Las Poké Balls aparecen cada 250–350 ms y permanecen 900 ms en caída, así que varias pueden estar cayendo al mismo tiempo. Se permiten hasta 20 activas para evitar bloquear nuevas apariciones cuando se acumulan capturas.
- Si un piloto se desconecta, el eje que controlaba vuelve a cero.
- La partida dura 90 segundos y la puntuación pertenece al equipo/búho.

## Estructura

- `server.js`: salas, asignación de plazas, validación de entradas, física, puntuación y sincronización Socket.IO.
- `public/index.html`: vistas de inicio, lobby, mando móvil y pantalla grande.
- `public/app.js`: interfaz, joysticks de eje único y renderizado del mapa.
- `public/style.css`: estilos responsive.

Las salas y partidas se guardan en memoria; no hay cuentas ni base de datos. Se permiten hasta 4 búhos y 8 pilotos.
