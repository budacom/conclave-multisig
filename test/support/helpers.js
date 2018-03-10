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

exports.assertTxSucceeded = function (_promise) {
  return _promise.then(function (_result) {
    assert.equal(_result.receipt.status, 1, 'transaction exited with status 0');
  }, function() {
    assert(false, 'transaction failed');
  });
};

exports.assertLogContains = function (result_, event_, match_) {
  assert(
    _.some(result_.logs, (l) => l.event === event_ && _.isMatch(l.args, match_)),
    'Matching event not found'
  );
};
