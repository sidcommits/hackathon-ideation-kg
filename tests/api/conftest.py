import asyncio
import inspect

import pytest


# pytest-asyncio is not installed in this project, so `@pytest.mark.asyncio`
# coroutine tests would otherwise be collected but never executed (silently
# "passing"). This hook actually runs them, so async tests really verify the
# async agent loop.
def pytest_pyfunc_call(pyfuncitem):
    testfn = pyfuncitem.obj
    if inspect.iscoroutinefunction(testfn):
        sig = inspect.signature(testfn)
        kwargs = {n: pyfuncitem.funcargs[n] for n in sig.parameters
                  if n in pyfuncitem.funcargs}
        asyncio.run(testfn(**kwargs))
        return True
    return None


def pytest_configure(config):
    config.addinivalue_line("markers", "asyncio: run this coroutine test")
