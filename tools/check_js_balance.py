import sys
p='d:/TIARAS/New folder/Web1/Web/y/assets/js/app.js'
with open(p,'r',encoding='utf8') as f:
    s=f.read()
pairs={"{":"}","(":")","[":"]"}
stack=[]
for idx,ch in enumerate(s,1):
    if ch in pairs:
        stack.append((ch,idx))
    elif ch in pairs.values():
        if not stack:
            print('Unmatched closing',ch,'at',idx); sys.exit(1)
        last,li=stack.pop()
        if pairs[last]!=ch:
            print('Mismatched',last,'opened at',li,'but closed by',ch,'at',idx); sys.exit(1)
if stack:
    # report last unclosed opening with line/col snippet
    ch,pos = stack[-1]
    # compute line/col
    before = s[:pos]
    line = before.count('\n') + 1
    col = pos - (before.rfind('\n') + 1)
    print(f'Unclosed {ch} opened at char {pos} (line {line}, column {col})')
    # show surrounding lines
    lines = s.splitlines()
    start = max(0, line-4)
    end = min(len(lines), line+2)
    print('\nContext:')
    for i in range(start, end):
        prefix = '>' if i+1==line else ' '
        print(f"{prefix} {i+1:4}: {lines[i]}")
    sys.exit(1)
print('All balanced')
