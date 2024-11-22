# Ciel

## Version 3.0.0
> Major Error handling changes and refactoring
> No new commands many renamed
> Added sharding support no performance gain future proof test
> Added Reasource Logging to be able to have a quick check 

# Issues:
> More servers added and its consequences
- Servers with Manual Summon preview is impacting race conditions for rest of the bot features
- Servers with huge active members have demand in command use is slower compare to before
- Interaction issues are offen [ FIX IN THIS COMMIT ]

### Slash Commands

> `/mycards` renamed `/inventory`
> `/search` command added `/find`
> `/registerguild` command added `/register`

# New Features
> Giveaway Levels can now be set free or paid for first ticket
> Giveaway annoncement command added 

# First Feature running on Ciel-Ping Bot
> Manual Summon is now pinged 

# Database Changes
> Added easy toggle for Dev to be able to set
- Manual Claims
- Manual Summons preview data
- Auto Summon preview data
- Auto Summon claims

> Added Admins to be able to toggle Version Previews and Manual Summon pings

## Version 2.0.0
> Major rehaul of Slash Commands
> Manual and Auto Summon now shows preview of cards in embed
> Auto checks Slime Tokens Drops and Giveaways in Gate Guild
### Gate Economy System
> Added Gate Economy System
> `/gate` commands added `/gate giveaway`, `/gate balance`, `/gate buy ticket`, `/gate buy premium`, `/gate gift`
> `/gate` lead commands added `/gate toggle`, `/gate togglecards`, `/gate give <user> <type> <amount>`, `/gate take <user> <type> <amount>`, `/gate balance <user>`

### Slash Commands

### Mazoku API Related
> `/mycards` command added `/mycards name`, `/mycards anime`, `/mycards tier`, `/mycards version`, `/mycards sort_by`, `/mycards sort_order`
> `/search` command added `/search card:`
> `/wishlist` command added `/wishlist add`, `/wishlist list`, `/wishlist global`
### Server Mazoku Stats Related
> `/leaderboard` command added `/leaderboard tier`, `/leaderboard total`
> `/mystats` command added `/mystats overview`, `/mystats best`, `/mystats tiers`, `/mystats prints`, `/mystats tiertimes`, `/mystats printtimes`
> `/recent` command added `/recent tier`, `/recent sort_by`, `/recent sort_order`
> `/server` command added `/server overview`, `/server best`, `/server tiers`, `/server prints`, `/server tiertimes`, `/server printtimes`


## Version 1.3.0
> Added `/stats` and `/serverstats` commands
> Major rehaul of Datbase structure not yet full proof 

## Version 1.2.0
> Added `/search` command `/register` commands

## Version 1.1.0 

### Production Ready Version

> Two Commands added `/recent` and `/ping`
> Database setup completed
> Events, Commands, Slash Commands and Utilityfiles included


## Version 1.0.0

> Ciel Discord Bot codebase setup