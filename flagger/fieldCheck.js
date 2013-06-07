function foo(anb, b) {
    anb.moo = 7;
    b.moo = 8;
}

obj1 = {};
obj1.moo = 6;
obj2 = {};
foo(obj1, obj2);