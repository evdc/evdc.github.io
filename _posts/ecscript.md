# CSS As A Game Scripting Language

(This post is a companion to ["CSS As A Query Language"](./css-programming.md), but they can be read independently.)

In which we show that CSS and game engines share a certain , and that this insight points toward better scripting language design.

We are going for a wild ride across at least three existing programming languages -- CSS, Lua, Rust -- and possibly a new one? Buckle up.

## CSS

CSS is a language for doing layout in web design. To recap, the basic principles of CSS look like this.

### 1. There are Things

Such as:
```html
<h1>Hello, World!</h1>
<a href="example.com">This is a link</a>
<div class="awesome" data-custom-attribute="foo">
    <div id="child">This div is inside another one!</div>
</div>
```

Specifically, here, Things are *HTML elements*.

### 2. We can Describe Sets of Things

We can write down *selectors* which refer to *sets of Things* that all have *something in common*.

```css
/* The set of all things that are a div */
div

/* The set of all things with the id "child", which is just one thing */
#child

/* The set of all things with the class "awesome" */
.awesome 

/* The set of all things having an attribute `data-custom-attribute` with value "foo" */
[data-custom-attribute="foo"]
```

(We can also describe things based on their position in the document hierarchy relative to each other, a handy feature when our "Things" are HTML Elements, which tend to go inside each other.)

We can also *combine selectors* to perform set intersection on the Things they describe. This turns out to be crucial:
```css
div.awesome     /* The set of all things that are divs, AND have the class "awesome" */
```

### 3. We can Do Stuff to Those Things

It's not a very useful language to just describe sets of things in isolation. In CSS, we define *rules* that pair a selector (which selects a set of elements) with *declarations*, which describe what we would like to do with the elements in that set.

```css
div.awesome {
    color: red;
    font-size: 24px
}
```

This says: "For all elements which are divs and have class 'awesome', set these *properties* (`color` and `font-size`) to these *values*". This has the effect, in your web browser, of making these parts of the HTML page have giant red text. Pretty cool, right? Now you can be a 90s web designer.

## ECS

Ok, now let's talk about something completely different.

"ECS", which stands for ["Entity-Component System"](https://en.wikipedia.org/wiki/Entity_component_system), is an architectural pattern and a kind of engine, mainly used in the game development world. It's been gaining popularity recently-ish, including being implemented in [Unity](https://unity.com/ecs), as well as [several](https://bevy.org/) [open source](https://www.flecs.dev/) [libraries](https://github.com/skypjack/entt) and talked about in some notable [blog posts](https://skypjack.github.io/2019-02-14-ecs-baf-part-1/), some from [long ago](https://www.gamedevs.org/uploads/data-driven-game-object-system.pdf). I won't attempt to condense all those links here -- they're great, definitely peruse them if you're curious about what those game developers have been up to.

The design pattern of ECS is broadly as follows:
- We have Entities, which are just opaque ids. An Entity by itself doesn't store any data, but is used as a reference (properly, a "handle") into where data is actually stored, which is ...
- Components, which are plain old data that can be *associated* with entities. Component data is typically densely packed into arrays, one entry per entity that has the component. This data is acted on by ...
- Systems, which operate on a collection of entities that have the same components, and iterate over those entities, performing some updates (or rendering) to each one.

Here is an example in Bevy, one of the more popular ECS libraries for Rust:
```rust
fn movement_system(mut query: Query<(&mut Position, &Velocity)>) {
    for (mut pos, vel) in &mut query {
        pos.x += vel.x;
        pos.y += vel.y;
    }
}
```

This gets all entities having both a Position and Velocity component (via some Rust type system magic), iterates over them, and updates the position based on the velocity. This is roughly the "Hello, World" of ECS.

### Scripting

One issue with ECS engines that I've noticed is scripting. Game developers usually want to write "game logic" -- how you implement the actual game rules -- in a simpler scripting language like [Lua](https://www.lua.org/about.html) -- with the "game engine" (that handles lower level concerns like graphics/rendering, physics processing, I/O, etc) written in a lower-level language like Rust or C++. This is easier for a few reasons:
- The fast parts can be in a fast language
- The "game logic" at the intersection of programming and design can be made more accessible for the designers, who might not have Master's degrees in software engineering.
- Iteration speed and hot reloading: Scripting languages "compile" fast, and can be changed and reloaded without recompiling the whole Rust engine, which can take forever. (It's like the difference between reloading Javascript on a web page, and recompiling Chrome.)

ECS engines tend to struggle with this division a bit.

Bevy, for instance, is heavily designed around writing Rust to implement all game logic -- the core engine does not natively support scripting, although there have been some [third party efforts](https://github.com/makspll/bevy_mod_scripting) in that direction. 

In general, there is a bit of an [impedance mismatch](https://en.wikipedia.org/wiki/Object%E2%80%93relational_impedance_mismatch) between conventional scripting languages like Lua, which you could call "row-oriented" if you were squinting at it through a database-shaped lens; and the ECS world, which you could call "column-oriented" if, again, your vision has been warped by squinting at things through database-shaped lenses for the last several years and maybe you should see an eye doctor. 

What do I mean by "row-oriented" and "column-oriented" here? Broadly speaking, Lua is designed to operate on little bundles of data, which it calls "tables". Tables are, famously, its primary (only) data structure [1], subsuming what other languages would call "hash tables" or "dictionaries" or what Javascript would call "objects", and also "arrays" or "lists". Slightly confusingly, they are more like what a relational database would call a "row" than a "table" -- a table in a "row-oriented" relational database is sort of like a list of Lua's "tables" which all have the same keys (which are its columns).

So what's actually awkward about using Lua with an ECS? Let's look at a concrete example. This uses the `bevy_mod_scripting` Rust crate linked above to form the unofficial bridge between the two worlds. Don't worry about the crate-specific details too much.

The first thing you'll notice with `bevy_mod_scripting` is the basic model it gives you: a Script component is attached to a specific entity, and your Lua file responds to event callbacks like on_update. Your script is an entity. This is a natural, intuitive starting point:
```lua
-- movement.lua
-- This script is attached to a single entity (an "enemy", say)
-- Bevy calls on_update once per tick for the entity that owns this script

function on_update()
    -- Get components on *this* entity
    local pos = world.get_component(entity, Position)
    local vel = world.get_component(entity, Velocity)

    -- A Lua table: a little bundle of data we manipulate directly
    pos.x = pos.x + vel.x
    pos.y = pos.y + vel.y

    world.set_component(entity, Position, pos)
end
```

This is ... not actually too bad. It looks like the OOP scripting you'd write for a Unity MonoBehaviour — each object has a script, each script thinks about itself. Lua tables map nicely onto "one entity's worth of data". This is what I mean by "row-oriented": you grab a row (one entity, all its columns) and work on it.

Now suppose you have taken the ECS pill and want to write the movement system "properly" — not one script per entity, but a single system that updates all moving entities at once. This is the whole point of ECS: you're supposed to be thinking in columns, not rows, right? With bevy_mod_scripting's `system_builder` API, you can write this:

```lua
-- movement_system.lua
-- Registered as a dynamic system, not attached to a single entity

function movement_system(query_result)
    -- query_result is a ScriptQueryResult: a list of (entity, components) tuples
    for _, row in ipairs(query_result) do
        local pos = row[1]  -- Position component
        local vel = row[2]  -- Velocity component
        pos.x = pos.x + vel.x
        pos.y = pos.y + vel.y
        -- Note: modifications may need to be written back depending on reflect semantics
    end
end

-- Registered from on_init (or from Rust side):
function on_init()
    local update = world.get_schedule_by_name("Update")
    local system = system_builder("movement_system", script_id)
        :query(
            world.query()
                :component(Position)
                :component(Velocity)
        )
    world.add_system(update, system)
end
```
This works, and bevy_mod_scripting deserves credit for making this possible in Lua at all. But look at what just happened to our code. To write what is conceptually a very simple thing — "for all things that move, move them" — we've had to:
- Define a system registration function separately from the system logic function
- Navigate a schedule registry to find the right place to insert our system
- Call a builder API in Lua that mirrors Bevy's Rust query builder
- Work with query_result as a list of tuples, where the column order (`row[1]`, `row[2]`) is determined by the order we called `:component()` in the builder, a contract that lives somewhere else in the code

Compare this to the equivalent Rust:
```rust
fn movement_system(mut query: Query<(&mut Position, &Velocity)>) {
    for (mut pos, vel) in &mut query {
        pos.x += vel.x;
        pos.y += vel.y;
    }
}
```
In Rust, the query is the function signature. The type system enforces the contract between "what you asked for" and "what you're working with". The compiler knows that pos is a Position and vel is a Velocity because you wrote it down once, right there, and the language was designed to carry that information through. In Lua, that contract is maintained only by convention and by the programmer's memory.

This is the impedance mismatch. Lua is built around tables — self-contained, flexible, row-shaped bundles of named data. ECS is built around column-oriented, archetype-grouped data where the interesting operations are over sets of entities sharing sets of components. When you bring Lua into ECS as a scripting layer, you end up writing a bunch of imperative boilerplate to simulate what the ECS engine is already doing natively — querying, filtering, iterating. The query that Bevy expresses as a type (`Query<(&mut Position, &Velocity)>`) becomes, in Lua, a runtime object you assemble by calling methods and then pass around, hoping the pieces stay in sync.

To visualize why, consider how the two models store data conceptually:
```
Lua / "row-oriented"               ECS / "column-oriented"

entity_1 = {                       Position: [ (1,2), (3,1), (7,4), ...]
  position = {x=1, y=2},           Velocity: [ (1,0), (0,-1),(2,1), ...]
  velocity = {x=1, y=0},           Health:   [  100,    80,   nil,  ...]
  health   = 100,                                ^        ^      ^
}                                              e1       e2     e3
```

Lua's mental model is: "give me entity 1, I'll look at all its fields." ECS's mental model is: "give me the Position and Velocity columns, I'll iterate over all rows at once." A system that touches Position and Velocity in ECS is a tight, cache-friendly scan across two contiguous arrays. The same logic in a naively-scripted Lua loop is a series of hash table lookups, one entity at a time.

This isn't a knock on Lua! It's an excellent language for what it was designed for. And bevy_mod_scripting goes to considerable lengths to make the ECS model accessible from Lua. But you're always translating between two mental models that don't quite fit: Lua thinks in objects, ECS thinks in sets. Which brings us back to the question of whether there's a better syntax to close that gap.

## Bringing it Back Together

That was sort of a lot, so let's summarize the ECS architecture again. In an ECS, we can say:

### 1. There are Things

Which in this case are Entities (opaque ids).

### 2. We can Describe Groups of Things

We can select subsets of Entities based on what Components they have.

### 3. We can Do Stuff to Those Things

We can have "systems" that loop over a selected subset of Entities and update their Component values, or render them, or something.

Do those three points sound familiar?

## Oh No, I See Where You're Going With This

Oh yes.

An ECS system has the same basic structure as a CSS rule:

```css
/* If components were element attributes ... */
[position][velocity] {
    /* Select all entities with these two components */
    /* And update their position based on their velocity */
    position: position + velocity
}
```

You can't actually do this in CSS, of course. You can't set attributes on an element while also selecting that element - that could cause the selector to fire *again*, and need to update attributes *again*, and get stuck in an infinite loop, which the CSS Working Group expressly does not want. I wrote a [whole post about this](./css-programming.md). 

## That is Awful

You're right. We can do better with the syntax. 

We can take broad latitude here to reinvent the language while we're at it, inspired by the same basic principles. We will call it ECScript, which is definitely just based on the acronym "ECS", and not any sort of personal vanity.

For one, let's change the combinators. To be a little clearer, we'll use `&` as the intersection combinator (instead of CSS's direct juxtaposition like `.class-1.class-2`), `|` for a union/"or" combinator, and skip using `' '` for anything (for now).

We may also want to declare things with types, since we *are* after all writing for games, which run on backend hardware, and not in a browser:

```
// imagine a 2d grid

component Position : (Int, Int)
component Velocity : (Int, Int)

// This is a System:
Position & Velocity {
    Position[0] += Velocity[0]
    Position[1] += Velocity[1]
}
```

The first part of the rule is the selector. It matches every Entity with both a Position and Velocity component.

The second part of the rule is the "declaration block" in CSS terms, which defines what we *do* with each matched entity: we update its Position based on its Velocity.

Pretty cool, right? Job done, we can ship the next great scripting language now?

## When Does This Even Run? Where do Entities Come From? What About ...

Oh, wait, good questions. Ok. 

Implicitly, the "system" shown here runs on every "tick", for some notion of "ticks", roughly "each iteration of the game loop". 
The state modifications it makes (updating `Position` values) are not immediately applied, but *queued*, and become visible on the *next* tick. This allows all systems to see a consistent state when they run. This is analogous to [Bevy's Commands](https://docs.rs/bevy/latest/bevy/prelude/struct.Commands.html).

We may also want to do things other than update entity component values. E.g. create entities, destroy entities, associate entities with new components, ...

```
// Creating an Entity is done by giving it Components. the Entity itself is still implicit:
create {
    Position(0, 0), 
    Velocity(3, -4),
    Sprite("enemy.png"),
    Health(100)
}

// Selecting based on attributes aka values of components, not just their presence/absence:
Player & [Health < 20] {
    // Add a component:
    +DamagedPowerup
}

// Joining multiple queries:
p: Player & Position, m: Monster & Position
where collision(p.Position, m.Position) {
    p.Health -= 10
}
```

I'm making up syntax and semantics by the seat of my pants here, but hopefully you get the idea.

Systems sometimes want to run after other systems:
```
MovementSystem = Position & Velocity { ... }

@after(MovementSystem)
p: Player & Position, m: Monster & Position
where collision(p.Position, m.Position) {
    // ...
}
```

There's a lot of ways you could slice this one. Maybe you want some notion of *events*:
```
on KeyPress(Keys.LeftArrow) {
    Velocity {
        Velocity.x -= 10
    }
}

@after(MovementSystem)
p: Player & Position, m: Monster & Position
where collision(p.Position, m.Position) {
    do CollisionEvent(p, m)
}

on CollisionEvent(p: Player, m: Monster) {
    // ...
}
```

I imagine this could get hairy rather quickly. But what's the worst that could happen?

## Why CSS, Though

One thing CSS is naturally quite suited for is navigating *hierarchies*. The DOM is a hierarchy:

```css
/* Descendant combinator: any .tooltip anywhere inside a .card */
.card .tooltip {
    font-size: 12px;
}

/* Child combinator: only direct children */
.card > .card-title {
    font-weight: bold;
}

/* You can chain these to express structural relationships */
.inventory > .slot > .item[data-rarity="legendary"] {
    border: 2px solid gold;
}
```

One thing you often want to do in a game is put Position entities (those having a spatial coordinate in the game world) "inside" other Position entities (e.g., a Player inside a Spaceship), such that the child entity's Position is defined *relative* to its parent's Position -- when the Spaceship moves, the Player moves with it. Intuitive, right?

ECS natively stores everything in flat arrays, which do not lend themselves well to hierarchical traversal.
ECS engines tend to evolve [bespoke solutions](https://docs.rs/bevy_hierarchy/latest/bevy_hierarchy/) that are [not always the most intuitive](https://github.com/bevyengine/bevy/blob/main/examples/ecs/hierarchy.rs) for this (although the linked Bevy example isn't *too* bad). 

((TODO: show how to do this in Bevy and Flecs))

In ECScript, we might just write something like:
```
parent: Position > child: Position {
    child.WorldPosition = parent.WorldPosition + child.LocalPosition
}
```

By analogy to a `>` combinator from CSS (or something like [Container Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries)).

## Aside: Typing

Astute readers may notice that an ECS library (particularly an ["Archetype ECS"](https://ajmmertens.medium.com/building-an-ecs-2-archetypes-and-vectorization-fe21690805f9)) essentially implements a very dynamic, fully structural "type system" inside of a host programming language (usually C++ or Rust) that does *not* have such a type system. 

An Entity's "archetype" is precisely "the set of components it has". If an entity e1 has components Player, Position, Velocity, Drawable then its "archetype" isn't "Player", it is `{Player, Position, Velocity, Drawable}`. If an entity e2 has components Monster, Position, Velocity, Drawable, we generally don't try to stuff that in an inheritance hierarchy -- we just say its "archetype" is `{Monster, Position, Velocity, Drawable}`. This gives us a lot of flexibility, which is required in the world of video games where our brilliant gameplay designers will sometimes go on a bender at 3am and say "What if we had Books but when you activate a specific Spell they turn into Sharks?? And some of those can Fly?!?" If you're trying to shove this into a Java-style inheritance hierarchy involving words like `Enemy` and `InventoryItem` and `Shark extends Enemy` and `extends InventoryItem, FlyingShark` you are probably going to have a Bad Time. (Archetype ECS engines benefit not just from design flexibility but improved performance for certain operations, by storing all entity-component data from the same "archetype" in a contiguous table in memory, making queries for all entities of that archetype very fast.)

Particularly, if the type of an entity is just "the set of its components" and entities can add/remove components, this means *the type of an entity can change at runtime*, which I'm pretty sure is enough to make any type theorist run to the bathroom. And yet, people keep wanting [something shaped like static typing](https://github.com/bevyengine/bevy/issues/1481) on top of Archetypes, because occasionally having everything be a highly-dynamic structural soup is enough to make even a regular programmer want to run to the bathroom, and you *want* to impose some sort of constraints back onto the world in order to preserve what's left of your sanity.

Given the discussion on the linked issue, which has been open since 2021, it's clear this is not exactly a trivial problem. I don't claim to have the final answer (a limited form of row polymorphism? Some checks deferred to runtime? A `fixed` annotation that says "entites of this archetype *won't* change components at runtime"? Put a SAT solver in your game engine?!?).

In a language like ECScript, at least, we can make these type / constraint issues *legible* to the programmer, without getting them confused with the C++/Rust type system we're working inside of.

## Relational Databases

[Greenspun's Tenth Rule](https://www.laws-of-software.com/laws/greenspun/) states:

> Any sufficiently complicated C or Fortran program contains an ad hoc, informally-specified, bug-ridden, slow implementation of half of Common Lisp.

By analogy, I propose evdc's Eleventh Rule [2], which states:

> Any sufficiently complicated program which stores and transforms data, eventually implements an ad hoc, informally-specified, bug-ridden, slow implementation of half a relational database.

Which it turns out is a lot of programs! In particular, let's look at our ECS design again:
- We store data in densely packed arrays, for components, which resemble "columns".
- We group these columns into "archetypes", aka "tables".
- We can query these tables.
    - We can also query across tables, for "all entities (in any table) with these columns", something trickier for relational databases to do.
- We need to do things like recursive and hierarchical queries that traverse relationships between entities (components wherein the value is another entity ID) performantly without a whole lot of special-casing.

This smells a lot like an in-memory relational database. This parallel has been noted before. ECScript is, if anything, an attempt to skip at least the "ad hoc, informally-specified" part by starting from relational principles up front.

For the last point, at least -- about relational and hierarchical queries -- we can look to [the ancient arts](https://en.wikipedia.org/wiki/Datalog) for some inspiration.


## An Exercise to the Reader

To the best of my knowledge, a language like ECScript doesn't quite exist yet. I've drafted some further designs than this, but never got around to implementing them in quite this form. A large part of the challenge is honestly just in integrating with existing ECS engines (like Bevy, Flecs, etc) and their own opinions about game logic, memory model, runtime semantics, etc. Ideally this is a drop-in scripting language like Lua, but the APIs of these engines aren't always *meant* for that, so there's a big cloud of question marks in the middle there.

Flecs comes closest to this vision with its [string-based query expressions](https://www.flecs.dev/flecs/md_docs_2FlecsQueryLanguage.html), which cover the "Describe Sets of Things" half of what ECScript proposes. But the "declaration block" (the part which Does Stuff to the Things we Selected) still lives in C++ or Rust. The idea here is unifying both sides into one declarative syntax, the way CSS unifies selector and declaration, and also making it a scripting language with the various niceties (hot reload, etc) that has.

CSS shows that a declarative, set-oriented language for transforming structured data could be powerful enough to drive millions of web sites and comprehensible enough to be learned by millions of web developers (well, [mostly](https://media1.tenor.com/m/QWdPngpHxZ8AAAAd/family-guy-css.gif).) ECS is just waiting for the same treatment.

Maybe one day I'll vibe code it up. Or you can! I give you, dear reader, my blessing to take these ideas and run with them. All I ask is that, if you get a job doing compilers / language design / game dev from doing so, drop me a referral :)

---

Footnotes

[^1]: if you don't count [a closure as a data structure](https://wiki.c2.com/?ClosuresAndObjectsAreEquivalent)

[^2]: The other 10 rules are still pending. But alliteration!