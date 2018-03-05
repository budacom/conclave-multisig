exports.wait = function (_promiseFun) {
  return function(_done) {
    _promiseFun().then(_done, _done);
  };
};

exports.assertItFails = function (_promise) {
  return _promise.then(function () {
    assert(false, 'did not fail');
  }, function() {
    assert(true);
  });
};

exports.assertLogContains = function (result_, event_, match_) {
  assert(
    _.some(result_.logs, (l) => l.event === event_ && _.isMatch(l.args, match_)),
    'Matching event not found'
  );
};
