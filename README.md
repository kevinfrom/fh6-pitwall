# Pitwall

A real-time telemetry dashboard for Forza Horizon 6, designed to run on a second monitor while you play.

## How it works

Forza Horizon 6 sends UDP data via it's **Data Out** feature. You configure FH6 to send data to your installation of Pitwall, which then creates a realtime dashboard for you.

### Modes

Pitwall has four modes:

- **Race**: See your speed, power, throttle, bake, gearing and steering
- **Drift**: Are you sideways? How much? Are you counter-steering?
- **Drag**: 0-100 km/h timer, speed, gear, launch, power and do you have grip?
- **Spotter**: Shows your race position, lap number, lap times and delta to best lap

## Setup

### Installation

Pitwall ships as a single portable `.exe` for Windows — no installer, no setup.

1. Go to the [Releases](https://github.com/kevinfrom/fh6-pitwall/releases) page and download the latest `FH6-Pitwall-*.exe`.
2. Double-click it to launch. A Pitwall window opens with the dashboard.
3. The first time you run it, **Windows Firewall** will ask whether to allow Pitwall to receive data. Click **Allow access** — this lets FH6's telemetry reach Pitwall. (Allowing it on private networks is enough.)

That's it. You can put the `.exe` anywhere (Desktop, a games folder, etc.) and run it whenever you want to use Pitwall.

### Configure Data Out

Once you've installed Pitwall and launched it, you need to configure FH6 to use Pitwall for Data Out:

1- Open your FH6 settings in-game
2- Go to **HUD and Gameplay** and scroll down to **Data Out**
3- Set **Data Out** to **On*
4- Set **Data Out IP Address** to **127.0.0.1** (localhost/your own machine)
5- Set **Data Out Port** to `9999`.

Now open Pitwall in your browser and start playing FH6. FH6 only sends data while actively driving - not in menus, when the game is paused, or during replays.

## Issues

If you're having any issues, please let me know by creating an issue here on GitHub!


