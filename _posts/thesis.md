IN which I attempt to explain (part of) what I'm on about.

My [previous](2026-04-18-css-programming.md) posts have been orbiting some common themes, circling them like water around a bathtub drain. In this post I will attempt to bring them together and articulate them, somewhat more clearly.

It goes roughly like this:
- A lot of software suffers from [“accidental complexity”](https://curtclifton.net/papers/MoseleyMarks06a.pdf) and we would like to reduce this. 
- There is a Model of Computation that can be described as having the basic shape of:
    - There are Things (facts, atoms, domain entities, rows, records, ...)
    - We can Describe Sets of Related Things 
    - We can Do Stuff to Those Sets
- Taken together, the above three principles, plus a few more (e.g. some notion of "events", and an "execution cycle" which proceeds in discrete "steps"), can be applied to a surprising number of domains, if you squint at them hard enough
- Using a relational model for the state of such a system [solves a few problems](https://curtclifton.net/papers/MoseleyMarks06a.pdf) with an object-oriented model
    - And also allows for [incremental maintenance](https://materializedview.io/p/everything-to-know-incremental-view-maintenance) thanks to e.g. [DBSP](https://www.vldb.org/pvldb/vol16/p1601-budiu.pdf)
- New programming languages, runtimes, frameworks or platforms can help unify the above points, and make complex systems easier for both humans and LLMs to develop and reason about.

My work is an attempt to build the latter.

---

## Prior Art

((todo fill in -- Eve, differential dataflow, dbsp, electric sql, livestore, riffle, ...?))

## Questions

#### Q. What about LLMs

A common speculation I've seen around social media in general is that the now, in the Age of AI, developing new languages/frameworks is a useless endeavor, because:
- LLMs can handle complexity for you; we all program in English now, no one programs in Typescript, so they certainly won't bother to program in YourEsotericLanguage. 
- LLMs are trained on existing languages/frameworks with lots of pre-existing samples and documentation in the training corpus; an LLM will be good at Typescript, but it won't be any good at YourEsotericLanguage.

I am a bit skeptical of both of these claims.

LLMs struggle with complexity in much the same way humans do, and benefit from composable layers of abstraction, much the way humans do. They might be "better" than us at coding within some benchmarks, but ultimately since they were (roughly) trained to reproduce and imitate human writing/coding, many of both their strengths and failure modes are sort of endearingly human-seeming. An LLM *could* just write x86 or ARM assembly for you based on English descriptions and skip these silly "high level languages" altogether, so what's the point of even having Python or C? Well, even though Claude is surely better than *me* at x86 assembly, it still has a much higher chance of making mistakes if you had it write a script to say, fetch emails, in x86 assembly vs. in Python. Despite advertisements of increasingly long context windows (1M+ tokens), every engineer who's done serious work with these tools knows the AIs are still struggling to effectively *use* all that context, and managing your context windows carefully is the difference between a successful agentic coding harness and something that blows up in your face and goes viral on Twitter. Keeping reasoning and intent in the context window allows for fewer mistakes.

Further, the golden age of "throw more tokens at it" seems to be ending, as of mid 2026. Foundation model providers, which operate on a "your first hit is free" business model, are starting to impose stricter usage limits and higher per-token pricing, and developers are [realizing](https://github.com/juliusbrussee/caveman) "Oh maybe it is actually beneficial to try to conserve tokens after all". 

tl;dr A language which allows you to concisely, declaratively express what you want will allow an LLM to burn fewer tokens while also making fewer mistakes -- just as it will for a human.

#### Q. Why don't you just go outside

I dunno. I think I'm cursed.

## Propsal

We [^1] propose a system that works roughly as follows:

### 1. There are Things

As stated in the into, "Things" are facts, domain entities, records, rows, whatever. Data. We always start with data.

In CSS, Things are HTML elements. In an entity-component-system game engine, they're game entities (players, monsters, bullets, tiles, powerups, flying sharks, ...). In a SQL database, they're rows. In Datalog, they're "atoms". Etc.

We can enrich this a bit. Things probably have a Shape, that is roughly what some people call a "type" or "class". 

### 2. We can Describe Sets of Related Things

Things have *attributes*, or *properties*, or *tags*, or something. Rows in a DB table have columns, HTML elements have type (div vs span vs article vs marquee ...) and attributes and parent/child relationships, game entities have components.

We can write some sort of *selector* or *query* which describes "all Things having such-and-such in common". 

### 3. We can Do Stuff to Those Sets

Once we've described a Set of Related Things, we can Do Stuff with all the things in that set, all at once. We can change their attributes. We can delete them. We can add new Things, which might have attribute values coming from some of the Things we've described.

#### 3.1 Hold Up A Minute

We have to be a bit careful here, though. Imagine:
- We have some Sets of Things, say the set of "all Things that are Red" and the set of "all Things that are Blue".
- We can make changes to them, say, "for all Things that are Red, change them to be Blue".
- But now 

Uh oh. Ok. Let's think a minute here.

We clearly need some notion of *time*. We have these "rules" (for all Things where ... -> do ... to them), but they're not just always and eternally true, like beautiful little math equations. Rules run, or fire, at certain times, and there is a "state of the world before they fire" and a "state of the world after they fire". One rule firing may cause another rule to fire. 

Time makes everything complicated.

---

more broadly (the above basically just describes the IVM/event runtime)
- 

---

Footnotes

[^1]: It's actually just me. I'm using the Royal We, or alternately the "Academic We", because it sounds cool.

