---
layout: post
title: "Everything Is A Maintained Relation"
permalink: /blog/maintained-relations
---

In which I attempt to explain what I'm on about.

My [previous posts](/blog/css-query) have been orbiting some common themes, circling them like water around a bathtub drain. This post is an attempt to bring them together and say the thing directly.

It goes roughly like this:

- A lot of software suffers from ["accidental complexity"](https://curtclifton.net/papers/MoseleyMarks06a.pdf), and we would like less of it.
- There is a model of computation with the basic shape of:
    - There are **Things** (facts, atoms, domain entities, rows, records, ...)
    - We can **describe sets of related Things**
    - We can **do stuff to those sets**
- Add a notion of *events* and an *execution cycle* that proceeds in discrete steps, and this shape fits a surprising number of domains, if you squint.
- Modeling the state of such a system *relationally* [avoids some problems](https://curtclifton.net/papers/MoseleyMarks06a.pdf) with modeling it as a graph of mutable objects — and, crucially, it makes the whole thing [incrementally maintainable](https://materializedview.io/p/everything-to-know-incremental-view-maintenance), thanks to work like [DBSP](https://www.vldb.org/pvldb/vol16/p1601-budiu.pdf).
- A new language, runtime, or platform can unify all of the above, and make complex systems easier for both humans and LLMs to build and reason about.

My work is an attempt to build the latter.

The one-sentence version, which is also the title: **a query, a constraint, and a rendered list are the same thing: a relation maintained under change.** Once we realize this, perhaps we can stop building the same thing(s) over and over in slightly different ways.

---

## Part 1: The Shape

I've covered the first three bullets at length elsewhere, so here's the compressed version.[^recap]

**There are Things.** In CSS they're HTML elements. In an entity-component-system game engine they're entities — players, monsters, bullets, powerups, flying sharks. In SQL they're rows. In Datalog they're atoms. In your app they're the domain objects you'd draw on a whiteboard in a meeting with boxes and arrows and stuff, the way we've been doing since the 80s.

**We can describe Sets of related Things.** CSS calls this a selector. SQL calls it a `WHERE` clause. Datalog calls it a rule body. An ECS calls it a query over component types. They are all the same move: *name a set by what its members have in common, rather than by enumerating them.*

**We can do stuff to those Sets.** Set properties on all of them at once. Delete them. Derive new Things from them. CSS declarations, SQL `UPDATE`, Datalog rule heads, ECS systems.

Three languages that look nothing alike, doing the same three things. Enough signal to indicate, hey, maybe there's something here.

## Part 2: Time Ruins Everything

"data that changes over time" comes in and kicks over all our nice clean little models. All my homies hate time-varying mutable state.

Suppose we have the set of all Things that are Red and the set of all Things that are Blue. And suppose we write a rule:

```
for all Things that are Red -> make them Blue
```

Fine. Run it. Now what?

Now every formerly-Red Thing is Blue. So the rule matches nothing, so it doesn't run, so... does it stay Blue? Does the rule notice that its own precondition is now false and undo itself? If another rule says "for all Things that are Blue, make them Red," do we flicker forever?

I raised exactly this in the CSS post and cheerfully deferred it:

> What does it mean to say "for all elements with color red, their color is blue"? Does it render red for a second and then flicker to blue? Does it flicker back and forth? Does it just say this is a contradiction, like 3 = 4, and give up?
>
> There's a way to answer this. We'll get there.

So let's try to get there. The answer is that **rules are not eternal truths, they are things that happen at a time**, and you have to say so explicitly.

The model needs a *cycle*:

1. Inputs arrive from outside — a click, a keystroke, an HTTP request, a tick of the game clock. Call these **events**. Nothing else changes the world.
2. The world advances one **step**. Inside a step, rules read a *fixed snapshot* of the world as it was at the start, and their effects accumulate into the world as it will be at the end.
3. Between steps, nothing is half-updated. You never observe an inconsistent state. (The database people call this "transactional".)

That single discipline dissolves the paradox. "For all Red things, make them Blue" reads Red-ness from the *before* state and writes Blue-ness to the *after* state. It doesn't flicker, and it doesn't chase its own tail, because the thing it's reading and the thing it's writing are separated in time by construction. If you want an oscillator you have to ask for one across two steps, which is honest.

This is not exotic. It's a render frame in a browser. It's a tick in a game loop. It's a transaction in a database. It's — sort of, squintingly, with several asterisks — a render pass in React. Every system in this shape reinvents the step, usually informally and usually incorrectly around the edges. The proposal is to make it the load-bearing primitive instead of an emergent property of the framework's internals.

There's real prior art on the "put time in the relational language" problem specifically: Hellerstein's [Dedalus and Bloom](https://bloom-lang.net/) are the serious version of this idea, and if the above felt hand-wavy, that's because it *is*, and they aren't, so check there if you want the academic level of treatment that isn't someone's personal blog.

## Part 3: Doing It All Again Is Wasteful

So we have a cycle. The naive implementation is: every step, re-run every rule over every Thing.

CSS basically does this. An ECS deliberately does this, and gets away with it because the data is small, contiguous, and the recompute is a tight loop over packed arrays — [data-oriented design](https://www.dataorienteddesign.com/dodbook/) makes brute force cheaper than cleverness at that scale. (And for a game engine you kind of have to re-derive the World every frame anyway)

It stops being fine the moment your set of Things is the size of a database. You do not want to re-run every derived view over every row because one row changed. And "one row changed" is what *actually happens*, essentially always. Real systems experience small perturbations of large states.

So: don't recompute the answer. **Maintain** it.

The trick is to make *change itself* a first-class value. Instead of passing around "the set of Things," you pass around "what's different about the set of Things," and every operator learns how to consume and produce differences.

The representation that makes this work cleanly is a **Z-set**: a set where every element carries an integer weight. Weight `+1` means "this row is here." Weight `-1` means "retract this row." A change is just a Z-set:

```
+1  (card7, "Buy milk")      -- inserted
-1  (card3, "Call mom")      -- deleted
```

Weights add. A `+1` and a `-1` for the same row cancel to zero and the row vanishes from the delta, which means *the algebra takes care of bookkeeping you would otherwise do by hand and get wrong.* Filters, projections, joins, aggregates, even recursive fixpoints all have delta versions — versions that take a change to their inputs and produce a change to their outputs, doing work proportional to the size of the change rather than the size of the data.

This is the [DBSP](https://www.vldb.org/pvldb/vol16/p1601-budiu.pdf) result, building on [Differential Dataflow](https://github.com/TimelyDataflow/differential-dataflow) before it. I want to be clear that this part is not my idea; it's a genuinely beautiful piece of work by other people, and it's the thing that converts the model in Parts 1 and 2 from "elegant but quadratic" into "elegant and shippable."

What I am trying to contribute here is roughly "where you point it" and "how pleasant it is to use".

## Part 4: The User Interface Is Also A Query

Here's the move the whole project rests on.

A rendered list is a query result. Not "like" a query result — it *is* one. The list of visible todos on your screen is `SELECT * FROM todos WHERE NOT completed ORDER BY position`, and the DOM nodes are its materialization. Everyone knows this and almost nobody builds on it.

The dominant approach instead is: re-derive the entire UI as a data structure, then *diff it against the one you built last time* to figure out what changed. That's a virtual DOM. It's a clever solution to a problem you created by throwing away information you already had. The framework knew what changed — the change is what caused the re-render in the first place! — and then discarded that knowledge, rebuilt the world, and went looking for it again with a tree diff.

If your query engine already emits deltas, you don't need to go looking. The delta *is* the DOM mutation, modulo translation. `+1 (card7, ...)` is an `insertBefore`. `-1 (card3, ...)` is a `removeChild`. No shadow tree, no reconciliation pass, no diffing something against itself.

### The part where it gets hard

Everyone has a plan until they ~get punched in the face~ have to render to DOM.

Consider renaming a card in a list in a todo app. Relationally, in an event-sourced model, that's a retraction and an assertion:

```
-1  (card7, "Buy milk")
+1  (card7, "Buy oat milk")
```

Applied literally, that is: remove the DOM node, create a new one, insert it. Which is *correct*, in the sense that the resulting HTML is right. It is also a disaster, because along the way you have destroyed:

- the text cursor, if the user was editing that field
- the selection
- in-progress IME composition, so good luck typing Japanese
- the drag you were in the middle of
- any CSS transition, which now restarts
- scroll position, focus, and every other piece of state that lives on the node rather than in your data

The DOM is not a pure function of your state. It's a pure function of your state *plus* a pile of user-agent state attached to specific node identities, and node identity is exactly what a naive delta application destroys.

So the runtime needs a classifier that looks at a batch of deltas and recognizes that a `-1` and a `+1` **on the same entity key** are not a removal and an insertion, they're an *update* — and fuses them into a single mutation on the surviving node. Get that right and the whole approach works. Get it wrong and you have built a framework that loses your cursor, which is to say you have built nothing.

This is implemented and tested in [Rex](https://github.com/evdc/rex), the current iteration. The acceptance tests are the boring ones that matter: retitling a card preserves the DOM node *and* the focus inside it; dragging a card between lists reuses the same node rather than recreating it; deleting a list with twenty cards is one `removeChild`, not twenty-one. Those tests are, in a real sense, the thesis of this whole project — everything above is philosophy until the cursor stays put.

## Part 5: One Mechanism, Several Miracles

Once you have "derived facts that get retracted when their justification goes away," some things that are usually separate subsystems collapse into each other.

A component unmounts because the query that produced it no longer produces it. Fine — that's just retraction. But now: what if that component had started an HTTP request?

In most frameworks, cancelling in-flight work on unmount is a separate concern with its own API, its own footguns, and its own genre of bug where you `setState` on a component that isn't there anymore. In this model it's the *same operation*. The request was justified by a derived fact; the fact was retracted; therefore the request is retracted; therefore it's cancelled. Cleanup isn't a lifecycle hook you have to remember to write. It's what retraction already means.

The design I'm working toward separates a retractable **intent** ("someone wants this GET to happen") from an irreversible **outcome** ("this POST was committed, and no amount of re-derivation un-charges the credit card"). Intents flow backward when their justification dies; outcomes don't, and the boundary between them is where the real difficulty lives.

I want to flag clearly that **this part is designed and not built.** Parts 1 through 4 exist and run. Part 5 is a spec and an argument. It's the piece I'd most like to be right about and the piece most likely to embarrass me.

## Part 6: The Same Trick, Downstairs

Everything above is about the client. The identical move works on the other side of the network, and I've been building that too (not quite ready for release yet): describe your domain as an ontology — entities, actions, policies, queries, workflows — and let a compiler lower it onto the boring components every backend has anyway (state, workers, queues, endpoints).

The framing I like is that a backend has a front end, a middle end, and a back end, exactly like a compiler does. Your domain model is the source language. The component topology is the IR. A monolith with one Postgres is one lowering of that IR; a distributed mesh is another lowering of *the same IR*, and the fact that we currently rewrite the entire application to move between them is an accident of tooling, not a law of nature.

This one is, I'll admit, downstream of spending a decade in data platform engineering and getting tired of writing the same pipeline for the fifth time with different YAML.

## Prior Art

I stand on the shoulders of giants -- I am not a researcher, just a humble engineer, a sort of magpie finding interesting shiny things out there in the field and gluing them together into a weird-looking nest:

**The direct ancestor:** [*Out of the Tar Pit*](https://curtclifton.net/papers/MoseleyMarks06a.pdf) (Moseley & Marks, 2006) — accidental vs. essential complexity, and "functional relational programming" as the prescription. This post is, more or less, an attempt to actually build the thing that paper describes and then declines to build.

**The ones who tried before:** [Eve](https://witheve.com) is the most serious attempt at a relational end-user language, and its [postmortem](http://incidentalcomplexity.com/) is required reading for anyone tempted down this road — including, especially, me. [Riffle](https://riffle.systems/essays/prelude/) makes the "your UI state should be in a database" argument well. [Mint](https://mint-lang.com) and [Elm](https://elm-lang.org) are where the *feel* of the surface language comes from.

**The engines:** [Differential Dataflow](https://github.com/TimelyDataflow/differential-dataflow) and Naiad (McSherry et al.); [DBSP](https://www.vldb.org/pvldb/vol16/p1601-budiu.pdf) (Budiu et al.) and [Feldera](https://www.feldera.com/); [Materialize](https://materialize.com/); [Noria](https://jon.thesquareplanet.com/papers/phd-thesis.pdf) (Gjengset's thesis, which is about exactly the "web app as materialized view" idea); Skip; and on the finer-grained end, [Adapton](http://adapton.org/) and Jane Street's Incremental.

**The current wave**, which did not exist in this density when I started and which I'm genuinely glad to see: [Electric SQL](https://electric-sql.com/), [Zero](https://zero.rocicorp.dev/), [LiveStore](https://livestore.dev/), [Convex](https://www.convex.dev/), [Triplit](https://www.triplit.dev/), [Jazz](https://jazz.tools/). Several of these are converging on the same conclusions from the sync direction rather than the language direction.

**The relational-time question:** [Dedalus and Bloom](https://bloom-lang.net/) (Hellerstein et al.), as mentioned in Part 2.

**And the necessary corrective:** Jamie Brandon's [*Against SQL*](https://www.scattered-thoughts.net/writing/against-sql/), which will disabuse you of any notion that "just use the relational model" means "just use SQL." The relational model is great. SQL is a particular and quite bad encoding of it, and a lot of people's allergy to the former is really an allergy to the latter. (Jamie's work, in general, is a large part of my inspiration.)

## Questions

#### Q. What about LLMs? Isn't language design pointless now?

The two versions of this objection I see are:

1. LLMs handle complexity for you. We all program in English now; nobody's writing Typescript, so they're certainly not going to bother learning YourEsotericLanguage.
2. LLMs are trained on languages with enormous corpora. Claude is great at TypeScript and will be useless at YourEsotericLanguage.

I'm skeptical of the first and I think the second is real but overstated.

LLMs struggle with complexity in much the same way humans do, and benefit from composable layers of abstraction, much the way humans do. They might be "better" than us at coding within some benchmarks, but ultimately since they were (roughly) trained to reproduce and imitate human writing/coding, many of both their strengths and failure modes are sort of endearingly human-seeming. An LLM *could* just write x86 or ARM assembly for you based on English descriptions and skip these silly "high level languages" altogether, so what's the point of even having Python or C? Well, even though Claude is surely better than *me* at x86 assembly, it still has a much higher chance of making mistakes if you had it write a script to say, fetch emails, in x86 assembly vs. in Python. Despite advertisements of increasingly long context windows (1M+ tokens), every engineer who's done serious work with these tools knows the AIs are still struggling to effectively *use* all that context, and managing your context windows carefully is the difference between a successful agentic coding harness and something that blows up in your face and goes viral on Twitter. Keeping reasoning and intent in the context window allows for fewer mistakes.
LLMs struggle with complexity in recognizably human ways, because they were trained on us.

But here's the version of the argument I've come to think is actually the strong one: **the binding constraint on machine-generated code is verification, not generation.**

Generation is now nearly free. What's expensive is knowing the output is correct, and being able to change it later without breaking something. If your job has shifted from writing code to reviewing code (as mine has, maybe yours too) then a language where the *compiler* proves more is worth more, not less. Every property the type system establishes is a property neither of us has to check by reading. That's a straightforward increase in the value of static guarantees, and it cuts exactly against the "languages don't matter now" position.

There's a token-economics argument too, which is less philosophically interesting but pays rent: a concise declarative spec burns fewer tokens than the imperative expansion of the same intent, both to write and to re-read on every subsequent turn. The golden age of "throw more tokens at it" seems to be ending, as of mid 2026. Foundation model providers, which operate on a "your first hit is free" business model, are starting to impose stricter usage limits and higher per-token pricing, and developers are [realizing](https://github.com/juliusbrussee/caveman) "Oh maybe it is actually beneficial to try to conserve tokens after all". Concise, checkable, declarative is the right shape for that world.

On the second objection — the training-data problem — I'll concede more than I used to. It is real, and it's the most legitimate criticism of this entire project. Models *are* much weaker on low-resource languages, and I have direct evidence: this codebase was substantially written by agents working from my designs and hand-written syntax sketches, and the difference between asking a model to write the Rust engine versus asking it to write a program in my own language is not subtle.

The mitigation I've landed on is that if models are part of your language's audience, you should *ship documentation as a build artifact* rather than as prose you hope gets scraped. I think "what a language owes the model" is going to be a real design discipline within a couple of years, and I'd like to write that post separately.

#### Q. Isn't this just a database? Or React with extra steps?

It's a database in the sense that it takes the relational model seriously, and not in the sense that you talk to it over a socket and it's someone else's problem. The central claim is that the boundary we've drawn — data over there behind a query language, logic in the middle in a general-purpose language, UI over here in a third paradigm, with serialization and cache invalidation taped across both seams — is not a natural boundary. It's where the tools happened to stop.

#### Q. Why don't you just go outside?

I dunno. I think I'm cursed.

## What Actually Exists

In the interest of not overselling: the current state of things, honestly.

- **[Rex](https://github.com/evdc/rex)** — the current and hopefully final iteration. Relational core, DBSP-style incremental engine compiled to WASM, and the delta-to-DOM layer described in Part 4. A Kanban app is written entirely in it, compiler-generated, passing the node-identity tests. Effects (Part 5) and persistence are next.
- **[Elysium](https://github.com/evdc/elysium26)** — the previous iteration, and the one that proved the whole shape end to end before I understood it well enough to build it properly. Frozen, but it's where most of the lessons came from.
- Several earlier attempts, in the ruins beneath.

---

If you've read this far, I'd genuinely like to hear where you think it's wrong. The failure modes of this idea are well documented — Eve went down swinging at almost exactly this — and I'd rather find out early which specific wall I'm walking toward.

---

**Footnotes**

[^recap]: At considerable length, in fact — ["CSS As A Query Language"](/blog/css-query) works through the CSS-to-Datalog version of this argument in detail. It's self-contained, and it is not required reading for this one.
