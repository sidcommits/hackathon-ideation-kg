"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/has-flag";
exports.ids = ["vendor-chunks/has-flag"];
exports.modules = {

/***/ "(ssr)/../../../../node_modules/has-flag/index.js":
/*!**************************************************!*\
  !*** ../../../../node_modules/has-flag/index.js ***!
  \**************************************************/
/***/ ((module) => {

eval("\nmodule.exports = function (flag, argv) {\n\targv = argv || process.argv;\n\n\tvar terminatorPos = argv.indexOf('--');\n\tvar prefix = /^-{1,2}/.test(flag) ? '' : '--';\n\tvar pos = argv.indexOf(prefix + flag);\n\n\treturn pos !== -1 && (terminatorPos === -1 ? true : pos < terminatorPos);\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi4vLi4vLi4vLi4vbm9kZV9tb2R1bGVzL2hhcy1mbGFnL2luZGV4LmpzIiwibWFwcGluZ3MiOiJBQUFhO0FBQ2I7QUFDQTs7QUFFQTtBQUNBLGtCQUFrQixJQUFJO0FBQ3RCOztBQUVBO0FBQ0EiLCJzb3VyY2VzIjpbIi9Vc2Vycy9wcmF0ZWVrcm9oaWxsYS9ub2RlX21vZHVsZXMvaGFzLWZsYWcvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZmxhZywgYXJndikge1xuXHRhcmd2ID0gYXJndiB8fCBwcm9jZXNzLmFyZ3Y7XG5cblx0dmFyIHRlcm1pbmF0b3JQb3MgPSBhcmd2LmluZGV4T2YoJy0tJyk7XG5cdHZhciBwcmVmaXggPSAvXi17MSwyfS8udGVzdChmbGFnKSA/ICcnIDogJy0tJztcblx0dmFyIHBvcyA9IGFyZ3YuaW5kZXhPZihwcmVmaXggKyBmbGFnKTtcblxuXHRyZXR1cm4gcG9zICE9PSAtMSAmJiAodGVybWluYXRvclBvcyA9PT0gLTEgPyB0cnVlIDogcG9zIDwgdGVybWluYXRvclBvcyk7XG59O1xuIl0sIm5hbWVzIjpbXSwiaWdub3JlTGlzdCI6WzBdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(ssr)/../../../../node_modules/has-flag/index.js\n");

/***/ })

};
;