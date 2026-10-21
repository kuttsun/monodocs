# A change inside code

```python
def connect(host, port=8080):
    sock = socket.create_connection((host, port))
    sock.settimeout(5)
    return sock
```

A paragraph after the code.
