function a(onlyParam) {
  var hello = "hello";
  return 3;
}

function b(first, second) {
  if (first) {
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