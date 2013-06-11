/*Cheese = function() {
    this.a = 5;
    this.b = 7;
}

function makeCheddar() {
    cheddar = new Cheese();
}

makeCheddar();
*/

function foo(hasField, doesntHaveField) {
    hasField.moo = {};
    doesntHaveField.moo = 4;
    hasField.moo.what = 9;
}

obj1 = {};
obj1.moo = {lala: 5};
obj2 = {};

foo(obj1, obj2);