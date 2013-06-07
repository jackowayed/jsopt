
function a(onlyParam) {
  // Life, Universe, and Everything
  try {
    var answer = 6 * 7;
  } catch (e) {

  }
}


function b(first, second) {
/* Here is a comment
spanning multiple
lines xs*/
    if (false) {
        var x = 5;
        x += 3
        return x;
    }
    return "a";
}
a("hello")
a({})
a(null)
b("harry", 4)
b("another", "something")

var person = {firstname:"John",lastname:"Doe"};  
person.lastname.suffix = "DR";
