---
layout: post
title: "CSS As A Query Language"
permalink: /blog/css-query
---

IN which we investigate using CSS as a query language, or even a general purpose programming language, to do things other than lay out web pages in a browser.

Question: Why in God's good name would you do that? CSS is [infamously confusing](https://media1.tenor.com/m/QWdPngpHxZ8AAAAd/family-guy-css.gif). And better query languages exist, right? Such as SQL, which famously [doesn't have problems](https://www.scattered-thoughts.net/writing/against-sql/).

Answer: [Because it's there.](https://en.wikipedia.org/wiki/George_Mallory#:~:text=When%20asked%20by%20a%20reporter%20why%20he%20wanted%20to%20climb%20Everest%2C%20Mallory%20purportedly%20replied%2C%20%22Because%20it%27s%20there.%22)

---

The basic principles of CSS look like this.

## 1. There are Things

"Things" are "domain entities", or "atoms", or "facts". They exist outside of CSS -- from CSS's perspective, they're just already and always there.

Such as:
```html
<h1>Hello, World!</h1>
<a href="example.com">This is a link</a>
<div class="awesome" data-custom-attribute="foo">
    <div id="child">This div is inside another one!</div>
</div>
```

Specifically, here, Things are *HTML elements*.[^1]

## 2. We can Describe Sets of Things

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

We can also describe things based on their position in the document hierarchy relative to each other, a handy feature when our "Things" are HTML Elements, which tend to go inside each other. 

We can also *combine selectors* to perform set intersection on the Things they describe. This turns out to be crucial:
```css
div.awesome     /* The set of all things that are divs, AND have the class "awesome" */
```

## 3. We can Do Stuff to Those Things

It's not a very useful language to just describe sets of things in isolation. In CSS, we define *rules* that pair a selector (which selects a set of elements) with *declarations*, which describe what we would like to do with the elements in that set.

```css
div.awesome {
    color: red;
    font-size: 24px
}
```

This says: "For all elements which are divs and have class 'awesome', set these *properties* (`color` and `font-size`) to these *values*". This has the effect, in your web browser, of making these parts of the HTML page have giant red text. Pretty cool, right? Now you can be a 90s web designer.

### 3a. Except Not That

But this has some pretty big limitations. For the most part, these declarations change properties of elements that are -- like elements themselves -- *outside the language*. In other words: you can set an element's color, but you can't select on an element's color:

```css
/* Your browser will reject this: */
div[color=red] {
    color: blue;        /* What would this even mean? */
}
```

This would, admittedly, be kind of confusing. What does it mean to say "for all elements with color red, their color is blue"? Does it render red for a second and then flicker to blue? Does it flicker back and forth? Does it just say this is a contradiction, like 3 = 4, and give up?

There's a way to answer this. We'll get there.

### 3b. An Actual Example

Here's something you might (possibly) actually want to do as a web developer.

You're building a design system. You have a "dark mode" aware component — a card with `data-theme="dark"` — and you want every interactive element anywhere inside it, no matter how deeply nested, to get inverted focus styles. Not just direct children, but any descendant, transitively, *unless* some intermediate component has explicitly opted out with `data-theme="light"`. ("But what if that's bad design?" The PM insists that it is, and the manager likes her more than you, so.)

In real CSS, you write:

```css
[data-theme="dark"] :focus {
    outline-color: white;
}

/* Undo it if there's a light-theme ancestor in between */
[data-theme="dark"] [data-theme="light"] :focus {
    outline-color: black;
}
```

This works ... for one level of nesting. Now what if there's a dark card inside a light panel inside a dark page? You add another rule. And another. You are now writing an [ad hoc, informally specified](https://en.wikipedia.org/wiki/Greenspun%27s_tenth_rule) version of a *transitive query*.

What you actually want to say is: "an element is effectively-dark if it has data-theme="dark", or if it has an effectively-dark ancestor with no effectively-light ancestor in between." That's a recursive relational definition. CSS cannot express it. CSSLog can:
```css
[data-theme="dark"] {
    class: +effectively-dark;   /* Adds the class with our hypothetical syntax. */
}

.effectively-dark > :not([data-theme="light"]) {
    class: +effectively-dark;
}

.effectively-dark :focus {
    outline-color: white;
}
```

The second rule propagates effectively-dark down through children, unless it hits an explicit light boundary. It runs *recursively*, until it's satisfied with itself that some sort of desired goal state has been reached, and then stops. CSS cannot do this today (well, sort of, see the end).

## 4. But What If You Could

Imagine a version of CSS which we will call CSSLog, for Reasons which you may guess but will eventually become clearer.

In CSSLog, just like regular CSS, you can write selectors, that match elements, and set properties on those elements. BUT, those selectors can:
- Set properties of elements which *affect whether other selectors match them*, like `class`.
- Create new elements?
- Destroy elements?!? (Probably not.)

Something like:
```css
div.foo {
    class: +bar     /* Add the class bar */
    +<div class="baz">    /* Add a child element */
}

div.bar {
    /* The element which previously had .foo, once the above rule runs, now also has .bar, and also matches here! */
}
```

What's the worst that could happen?

## 5. Are You Out Of Your God Damn Mind

Probably. But look, there's more precedent for this than you might expect. It just is usually written differently.

In a very different world from the crisp Retina screens of CSS designers, buried in dingy university labs and [esoteric former conferences](https://www.thestrangeloop.com/index.html) and maybe occasionally an internal department at a big tech company if you're lucky, people are writing code that might look something like this:

```datalog
parent(alice, bob).
parent(bob, carol).
parent(bob, dave).

ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
```

The hell is *that*? They're calling it "Datalog". (Also, that's where I got the name "CSSLog" from.)

What are those? Function calls? What's `:-` mean? What's with all the periods, are they object-oriented property access ... oh god, are they trying to do that thing like SQL from the 70s where they try to use punctuation and stuff to look like English sentences? Where did `alice`, `bob`, `X`, and `Y` even come from, anyway? I don't recall seeing anyone *declare* them with a `var` or `let` or anything sensible like that. And what does this even have to do with CSS?

It's surprisingly similar. Let's go through the steps:

### 5.1. There are Things

In this case, the Things are called *atoms*. Atoms spring into existence when they're first mentioned, there is no "declaration before use". `alice` and `bob` are atoms. (If you're familiar with e.g. Ruby, you can compare them to `:symbols`.)

### 5.2. We can Describe Sets of Things

In Datalog, we do this with *relations*. A relation is a set of tuples (this is also the definition of a SQL Table, not entirely coincidentally). A tuple is a list of atoms. E.g. in the example above, `parent` is a relation. `parent(alice, bob)` is a tuple in the `parent` relation. The `parent` relation is a set of pairs, such as the `(alice, bob)` pair, indicating "Thing 1 in this pair is the parent of Thing 2".

We can select things that match a query with *variables*. The following:
```
parent(bob, X)
```

is read as "All X such that (bob, X) is a tuple in the parent relation", or, "All X such that Bob is the parent of X". In this case, X would evaluate to a set of atoms, those being `carol` and `dave`. X is a variable. (Conventionally, variables are upper case and atoms or relations are lower case.)

We can also intersect sets, just like CSS can. This is usually called a *join*. Repeating the same variable name twice in a rule body joins on that variable:

```datalog
% These are unary relations, aka sets of atoms. Also yeah comments use `%`. 

woman(alice).
man(bob).
parent(alice, bob).
parent(bob, carol).

% "X is the mother of Y, if X is the parent of Y, and X is a woman."
% X was repeated in the body, so it's a join.
mother(X, Y) :- parent(X, Y), woman(X).
```

The example above essentially intersects "the set of all parents" with "the set of all women", to form "the set of all mothers".

A Datalog rule looks like this:

```datalog
head(X, Y) :- body1(X, Z), body2(Z, Y).
```

Read :- as "if". The right side is your body — a list of conditions, all of which must hold simultaneously. The left side is your head — the new fact you're asserting is true whenever the body holds. Commas in the body are "and". 

So `ancestor(X, Y) :- parent(X, Y).` means: "For all possible values of X and Y, X is an ancestor of Y, if X is a parent of Y."

To make the comparison explicit:

```datalog
% "If X is a div, and X has class awesome, then X has color red."

color(X, red) :- div(X), class(X, awesome).
```

```css
/* "If X is a div, and X has class awesome, then X has color red." Except we don't write the X. */
div.awesome {
    color: red;
}
```

Datalog and CSS look like each other, but backwards. The selector is the body. The declarations are the head. `:-` is `{` (err, sort of). We've been writing logic rules this whole time!

### 5.3. We can Do Stuff to Those Things

In Datalog, "doing stuff" doesn't just mean "setting a color". It means *deriving new facts* — asserting that new tuples belong to relations, based on existing ones.

Let's look at the "ancestors" example again, which is the one that shows up in every Datalog text ever, and who am I to break the tradition:
```
parent(alice, bob).
parent(bob, carol).
parent(bob, dave).

ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
```

The first rule says: parents are ancestors. Simple. The second rule says: if X is a parent of Z, and Z is already known to be an ancestor of Y, then X is also an ancestor of Y.
Notice that ancestor appears in both the head and the body of the second rule. It refers to itself. It's recursive.
Run this on the facts above and you get:

```datalog
ancestor(alice, bob).   % direct, from rule 1
ancestor(bob, carol).   % direct
ancestor(bob, dave).    % direct
ancestor(alice, carol). % alice -> bob -> carol, from rule 2
ancestor(alice, dave).  % alice -> bob -> dave, from rule 2
```

This is something SQL couldn't do before the WITH RECURSIVE keyword, which exists precisely because people kept needing to do stuff like this. (In typical SQL fashion, WITH RECURSIVE lets you express any recursive computation, but only if you shoehorn it into a weird syntax and semantics that doesn't always compose well with other parts of the language.). It's something CSS definitely can't do. But it's literally the first textbook example for Datalog.

Notice how I never wrote a `for` loop. We didn't have to explicitly say "keep going until you've got everything". The Datalog engine just... figures it out. How?

# 6. The Fix is Fixpoints

In normal CSS, the "cascade" is one forward pass: the browser reads all the rules, figures out which selectors match, and applies declarations. There's no feedback loop.

In CSSLog (and in actual Datalog), a rule can set an attribute that causes another rule to fire that sets another attribute that causes the first rule to fire again. So you can't just do one pass. You have to keep going. But where do you stop? 

Here is how a naïve Datalog engine works (informally):
1. Start with your base facts — the ones you wrote down explicitly, like `parent(alice, bob).`
2. Look at every rule. Match the "body" against the currently known facts, substituting in values for variables in the process. 
3. For each such match, add the "head" of the rule to your list of known facts.
4. If you added anything new in step 3, go back to step 2.
5. If you didn't, stop. You're done.

This is called "naive evaluation". It runs until the set of known facts stops growing, which is called the *fixpoint* — the point where applying all the rules produces nothing you didn't already have. [^2]

For the ancestor example, this looks like:

```
Base facts:
  parent(alice, bob)
  parent(bob, carol)
  parent(bob, dave)

Apply rules once:
  ancestor(alice, bob)   % derived from parent(alice, bob), by rule 1
  ancestor(bob, carol)   % derived from parent(bob, carol), by rule 1  
  ancestor(bob, dave)    % derived from parent(bob, dave),  by rule 1

Apply rules again:
  ancestor(alice, carol) % derived from parent(alice,bob) and ancestor(bob,carol), by rule 2
  ancestor(alice, dave)  % derived from parent(alice,bob) and ancestor(bob,dave),  by rule 2

Round 3:
  Applying rules again produces nothing new.
  
Fixpoint reached. Done.
```

Why does this work? The answer is called *monotonicity*. What this means in not academic-speak, in practical terms, is that you only ever add facts, not remove them. Because you start from a finite set of facts, and can only derive a finite amount of facts from those, you can only do a finite amount of work. When you *can* remove facts -- when a later result may cause an earlier result to no longer be true -- you lose this property, and then you're back in Infinite Loop Land. (This is why we maybe don't want CSSLog to allow deleting elements.) [^3]

(It turns out monotonicity is beneficial in other contexts, too, like distributed systems. [^4])

# 7. So What?

Ok, so, we've seen how CSS and Datalog are similar: they have Things ("HTML elements" or "atoms"), they can Describe Sets of Things via conjunctive queries ("selectors" or "rule bodies"), and they can Do Stuff With Those Things (set properties, or derive new facts). Why spend a whole blog post talking about it?

Well, for one thing, it's fun to make connections. Datalog (and its older, and more general, cousin Prolog) has been around since the 70's, originating from research in relational databases (from whence also SQL) and "AI" back when "AI" meant something very different from the LLMs that are currently taking over the world. It's been reinvented dozens of times since then -- [Datomic](https://www.datomic.com/), [Differential Datalog](https://github.com/vmware-archive/differential-datalog), various rule engines. It turns out whenever you want to describe a system where 1) There Are Things, 2) you can Describe Sets of Things, and 3) you can Do Stuff to those Things (possibly in ways that create more Things), you end up somewhere like here. But the database / logic programming people and the frontend web dev people don't always talk to each other. Maybe if they did we'd figure something cool out together!

This also sort of intersects with a real CSS feature: [Container Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_size_and_style_queries), a real but experimental spec. This lets you query the style of a parent or ancestor element, so you can apply styles to an element based on the styles of its container (the container being, again, a parent or ancestor):

```css
@container style(--theme: dark) {
  .card { background: royalblue; color: white; }
}
```

This is fine for most practical purposes. To be clear I am *not* suggesting it isn't! 
But the transitive-dark-mode example from section 3 above is subtly different: it needs to *propagate a derived fact down the tree*, stopping at certain boundaries. In other words:
1. An element needs to know whether it itself is "effectively dark" — not just whether some ancestor is dark.
2. That "effectively dark" status needs to propagate transitively through descendants.
3. It needs to stop propagating when it hits data-theme="light".

Container queries can't do step 2. You can query an ancestor's --theme custom property, but you can't query whether an ancestor has already been determined to be effectively-dark by another rule. The query reads from the DOM as-given; it doesn't see derived state. There's no way to write "apply this if any ancestor, transitively, has --theme: dark and no closer ancestor has --theme: light" — because that's asking for the result of a recursive computation, and container queries have no recursion. [^5]

An [article from 2015](https://alistapart.com/article/container-queries-once-more-unto-the-breach/) explains the motivation and limitations of this. The earlier "element queries" proposal kept failing for much the same reasons discussed here -- once you can query on a property that's also being set by a query, you can cause loops, potentially infinite ones. 

The [CSS Working Group](https://www.w3.org/groups/wg/css/) has been orbiting towards something similar to "CSSLog" for years. They wanted "element queries" or "container style queries", ran into the problem of infinite loops and fixpoint semantics, and solved it by *restricting the direction of information flow*: descendants can query information about ancestors, but not the other way around. This keeps it finite, without fixpoint semantics, as information can only propagate down the tree, and we never inject new "base facts", so to speak. Container queries can query ancestors but not style themselves. Style queries can't feed back upward. They keep almost building a Datalog engine, and then carefully not doing so, like going right up to the ocean and then running off giggling before the waves touch your feet. 

CSSLog just goes and dunks its whole head in the water, and says boldly, foolishly, "what if we just allowed cycles and evaluated to fixpoint like Datalog has been doing since the 70's?" CSS's answer is, in practice, "No, are you insane? Don't do that". It's a browser rendering engine, not an incremental relational database engine. 

# 8. A New Direction?

Ok, fine, CSS doesn't have Datalog semantics, and it probably never will, and arguably shouldn't. Your browser won't implement CSSLog any time soon.

But what if we flipped it around? Instead of trying to cram Datalog *semantics* into CSS, we could put CSS *syntax* on top of Datalog. Datalog's syntax has always been a bit of an obstacle -- programmers used to modern languages see `:-` and `.` and things like "no = statements" or "case sensitivity" and bounce off. Further, the 


---

Footnotes

[^1] Some pedant will probably try to jump in and be like, "well *actually* not everything that CSS operates on is an HTML element, what about pseudo--" Shut up, nerd.

[^2] It's "naive" because it re-evaluates all the already-known facts every time, which is obviously wasteful. The gold standard here is called "semi-naive evaluation", which only looks at the newly derived facts each time. Coming up with a better algorithm, to be termed "not-naive evaluation", is left as an exercise to the reader.

[^3] Infinite Loop Land isn't the worst place to live in *all* cases. Every Turing-complete language, including Javascript for instance, lives there. You can of course write `while true {}` all you want. But you probably don't want your browser rendering system, in particular, to hang forever because a frontend dev on some website you visited got confused about their logic.

[^4] Namely, that those programs that achieve consistency in distributed systems without expensive coordination are precisely those which are in "monotonic" in a way analogous to what we say here, a property called "Consistency As Logical Monotonicity". It's neat. See e.g. [here](http://bloom-lang.net/calm/), or [here](https://arxiv.org/abs/1901.01930) for a paper.

[^5] CSS maestros may point out that you could partially fake it with custom property inheritance. Something like:
```
[data-theme="dark"] {
  --effective-theme: dark;
}
[data-theme="light"] {
  --effective-theme: light;
}

@container style(--effective-theme: dark) {
  :focus { outline-color: white; }
}
```

This is a bit hacky but basically works, actually, for this specific case. CSS is pretty good at making hacks look like features, but inheritance is not *actual* transitive closure (e.g. one could imagine transitive closure along a property chain *other than* the parent/child relation built into the DOM structure), and so a slightly more complex version of this problem will break it. It's the principle of the thing!