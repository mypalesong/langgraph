---
sidebar_position: 2
---

# Node (노드)

Node는 그래프에서 **실제 작업을 수행하는 단위**입니다. 각 노드는 State를 입력받아 처리하고, 업데이트된 State를 반환합니다.

## 기본 노드 구조

노드는 단순한 Python 함수입니다:

```python
from typing import TypedDict

class State(TypedDict):
    value: int
    history: list

# 노드 함수: State를 받아 업데이트를 반환
def increment_node(state: State) -> dict:
    return {"value": state["value"] + 1}

def log_node(state: State) -> dict:
    return {"history": state["history"] + [state["value"]]}
```

## 노드 등록

`add_node()`로 그래프에 노드를 등록합니다:

```python
from langgraph.graph import StateGraph

graph = StateGraph(State)

# 방법 1: 함수 이름을 노드 이름으로 사용
graph.add_node(increment_node)

# 방법 2: 명시적 노드 이름 지정
graph.add_node("log", log_node)

# 방법 3: 람다 함수 (간단한 작업)
graph.add_node("double", lambda state: {"value": state["value"] * 2})
```

## 비동기 노드

LangGraph는 비동기 노드를 지원합니다:

```python
import asyncio

async def async_fetch_node(state: State) -> dict:
    """외부 API 호출 등 비동기 작업"""
    await asyncio.sleep(1)  # 시뮬레이션
    return {"data": "fetched_data"}

# 비동기 노드 등록
graph.add_node("fetch", async_fetch_node)

# 비동기 실행
async def run():
    app = graph.compile()
    result = await app.ainvoke(initial_state)
```

## LLM 노드 만들기

LangChain과 함께 LLM을 호출하는 노드:

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import MessagesState

llm = ChatOpenAI(model="gpt-4")

def chatbot_node(state: MessagesState) -> dict:
    """LLM을 호출하여 응답 생성"""
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

# 스트리밍이 필요한 경우
async def streaming_chatbot_node(state: MessagesState) -> dict:
    response = await llm.ainvoke(state["messages"])
    return {"messages": [response]}
```

## Tool 호출 노드

도구(Tool)를 호출하고 결과를 처리하는 노드:

```python
from langchain_core.tools import tool
from langchain_core.messages import ToolMessage

@tool
def calculator(expression: str) -> str:
    """수학 표현식을 계산합니다."""
    return str(eval(expression))

@tool
def get_weather(city: str) -> str:
    """도시의 날씨를 조회합니다."""
    return f"{city}의 날씨: 맑음, 20°C"

tools = [calculator, get_weather]
llm_with_tools = llm.bind_tools(tools)

def tool_executor_node(state: MessagesState) -> dict:
    """Tool 호출을 실행"""
    last_message = state["messages"][-1]
    tool_results = []

    for tool_call in last_message.tool_calls:
        tool_name = tool_call["name"]
        tool_args = tool_call["args"]

        # 도구 실행
        if tool_name == "calculator":
            result = calculator.invoke(tool_args)
        elif tool_name == "get_weather":
            result = get_weather.invoke(tool_args)

        tool_results.append(
            ToolMessage(content=result, tool_call_id=tool_call["id"])
        )

    return {"messages": tool_results}
```

## 클래스 기반 노드

복잡한 로직은 클래스로 캡슐화할 수 있습니다:

```python
class DataProcessor:
    def __init__(self, threshold: int):
        self.threshold = threshold

    def __call__(self, state: State) -> dict:
        """노드로 사용될 때 호출됨"""
        if state["value"] > self.threshold:
            return {"status": "high", "processed": True}
        return {"status": "low", "processed": True}

# 인스턴스를 노드로 등록
processor = DataProcessor(threshold=100)
graph.add_node("process", processor)
```

## 완전한 예제: 다중 노드 그래프

```python
from typing import TypedDict, Annotated, List
from operator import add
from langgraph.graph import StateGraph, START, END

class PipelineState(TypedDict):
    input_text: str
    tokens: Annotated[List[str], add]
    word_count: int
    is_valid: bool

def tokenize(state: PipelineState) -> dict:
    """텍스트를 토큰화"""
    tokens = state["input_text"].split()
    return {"tokens": tokens}

def count_words(state: PipelineState) -> dict:
    """단어 수 계산"""
    return {"word_count": len(state["tokens"])}

def validate(state: PipelineState) -> dict:
    """유효성 검사"""
    is_valid = state["word_count"] > 0 and state["word_count"] < 1000
    return {"is_valid": is_valid}

# 그래프 구성
graph = StateGraph(PipelineState)
graph.add_node("tokenize", tokenize)
graph.add_node("count", count_words)
graph.add_node("validate", validate)

graph.add_edge(START, "tokenize")
graph.add_edge("tokenize", "count")
graph.add_edge("count", "validate")
graph.add_edge("validate", END)

# 실행
app = graph.compile()
result = app.invoke({
    "input_text": "Hello LangGraph World",
    "tokens": [],
    "word_count": 0,
    "is_valid": False
})

print(result)
# {
#     'input_text': 'Hello LangGraph World',
#     'tokens': ['Hello', 'LangGraph', 'World'],
#     'word_count': 3,
#     'is_valid': True
# }
```

## 노드 설계 팁

1. **단일 책임**: 각 노드는 하나의 명확한 작업만 수행
2. **순수 함수**: 가능하면 부작용(side effect) 없이 구현
3. **부분 업데이트**: 전체 State 대신 변경된 필드만 반환
4. **에러 핸들링**: 노드 내에서 예외 처리 구현
5. **재사용성**: 범용적인 노드는 별도 모듈로 분리
