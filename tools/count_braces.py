p='d:/TIARAS/New folder/Web1/Web/y/assets/js/app.js'
with open(p,'r',encoding='utf8') as f:
    s=f.read()
print('{', s.count('{'))
print('}', s.count('}'))
print('(', s.count('('))
print(')', s.count(')'))
print('[', s.count('['))
print(']', s.count(']'))
