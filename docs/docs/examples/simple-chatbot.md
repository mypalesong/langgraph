---
sidebar_position: 1
---

# 간단한 챗봇 만들기

LangGraph로 **대화 기록을 유지하는 기본 챗봇**을 만들어봅니다. 이 예제에서는 State 관리, 노드 작성, 체크포인팅의 기초를 배웁니다.

## 완성 코드

```python
from typing import Annotated
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.checkpoint.memory import MemorySaver

# 1. LLM 설정
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)

# 2. 챗봇 노드 정의
def chatbot(state: MessagesState) -> dict:
    """사용자 메시지에 응답하는 챗봇"""
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

# 3. 그래프 구성
graph = StateGraph(MessagesState)
graph.add_node("chatbot", chatbot)
graph.add_edge(START, "chatbot")
graph.add_edge("chatbot", END)

# 4. 체크포인터와 함께 컴파일
memory = MemorySaver()
app = graph.compile(checkpointer=memory)

# 5. 대화 실행
def chat(user_input: str, thread_id: str = "default"):
    """사용자 입력을 받아 응답 반환"""
    config = {"configurable": {"thread_id": thread_id}}
    result = app.invoke(
        {"messages": [HumanMessage(content=user_input)]},
        config
    )
    return result["messages"][-1].content

# 대화 예시
print(chat("안녕! 나는 철수야.", "user-1"))
print(chat("내 이름이 뭐라고 했지?", "user-1"))  # 이전 대화 기억
```

## 단계별 설명

### 1단계: State 이해하기

`MessagesState`는 LangGraph가 제공하는 미리 정의된 State입니다:

```python
from langgraph.graph import MessagesState

# MessagesState는 내부적으로 다음과 같이 정의됨:
# class MessagesState(TypedDict):
#     messages: Annotated[list[BaseMessage], add_messages]

# add_messages 리듀서가 메시지를 누적시킴
```

### 2단계: 커스텀 State 사용하기

추가 정보를 저장하려면 MessagesState를 확장합니다:

```python
from typing import TypedDict, Annotated
from operator import add
from langchain_core.messages import BaseMessage

class ChatState(MessagesState):
    # 추가 필드들
    user_name: str
    mood: str
    turn_count: int

def chatbot_with_context(state: ChatState) -> dict:
    # State의 추가 정보 활용
    system_prompt = f"사용자 이름: {state.get('user_name', '알 수 없음')}"

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(state["messages"])

    response = llm.invoke(messages)
    return {
        "messages": [response],
        "turn_count": state.get("turn_count", 0) + 1
    }
```

### 3단계: 시스템 프롬프트 추가

```python
from langchain_core.messages import SystemMessage

def chatbot_with_system(state: MessagesState) -> dict:
    """시스템 프롬프트가 포함된 챗봇"""
    system_message = SystemMessage(content="""
당신은 친절하고 도움이 되는 AI 어시스턴트입니다.
- 항상 한국어로 답변합니다.
- 간결하고 명확하게 응답합니다.
- 필요시 이모지를 적절히 사용합니다.
""")

    # 시스템 메시지를 맨 앞에 추가
    messages = [system_message] + state["messages"]
    response = llm.invoke(messages)
    return {"messages": [response]}
```

### 4단계: 대화 종료 조건 추가

```python
from typing import Literal

def should_continue(state: MessagesState) -> Literal["chatbot", "__end__"]:
    """대화 종료 조건 체크"""
    last_message = state["messages"][-1]

    # 사용자가 "종료" 입력시 대화 종료
    if hasattr(last_message, "content"):
        if "종료" in last_message.content or "bye" in last_message.content.lower():
            return "__end__"

    return "chatbot"

# 그래프에 조건부 엣지 추가
graph = StateGraph(MessagesState)
graph.add_node("chatbot", chatbot)
graph.add_edge(START, "chatbot")
graph.add_conditional_edges(
    "chatbot",
    should_continue,
    {"chatbot": "chatbot", "__end__": END}
)
```

## 전체 개선된 버전

```python
from typing import Annotated, Literal
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, AIMessage
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.checkpoint.memory import MemorySaver

# LLM 설정
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)

# 시스템 프롬프트
SYSTEM_PROMPT = """당신은 '루미'라는 이름의 친절한 AI 어시스턴트입니다.

특징:
- 항상 친근하고 따뜻한 어조로 대화합니다
- 사용자의 이름을 기억하고 사용합니다
- 한국어로 자연스럽게 대화합니다
- 이전 대화 내용을 참고하여 맥락있는 응답을 합니다

사용자가 "종료", "bye", "안녕" 등을 말하면 작별 인사를 합니다."""

def chatbot(state: MessagesState) -> dict:
    """메인 챗봇 노드"""
    messages = [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]
    response = llm.invoke(messages)
    return {"messages": [response]}

def is_goodbye(state: MessagesState) -> bool:
    """종료 메시지인지 확인"""
    if not state["messages"]:
        return False
    last_user_msg = None
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            last_user_msg = msg
            break
    if last_user_msg:
        content = last_user_msg.content.lower()
        return any(word in content for word in ["종료", "bye", "안녕", "끝"])
    return False

def route(state: MessagesState) -> Literal["continue", "end"]:
    """다음 단계 결정"""
    if is_goodbye(state):
        return "end"
    return "continue"

# 그래프 구성
graph = StateGraph(MessagesState)
graph.add_node("chatbot", chatbot)
graph.add_edge(START, "chatbot")
graph.add_conditional_edges(
    "chatbot",
    route,
    {"continue": END, "end": END}  # 둘 다 종료 (간단한 예제)
)

# 컴파일
memory = MemorySaver()
app = graph.compile(checkpointer=memory)

# 대화형 인터페이스
def run_chat():
    print("=" * 50)
    print("루미 챗봇에 오신 것을 환영합니다!")
    print("대화를 시작하세요. 종료하려면 '종료'를 입력하세요.")
    print("=" * 50)

    thread_id = "session-1"
    config = {"configurable": {"thread_id": thread_id}}

    while True:
        user_input = input("\n당신: ").strip()
        if not user_input:
            continue

        result = app.invoke(
            {"messages": [HumanMessage(content=user_input)]},
            config
        )

        ai_response = result["messages"][-1].content
        print(f"\n루미: {ai_response}")

        if any(word in user_input.lower() for word in ["종료", "bye", "안녕히"]):
            print("\n대화가 종료되었습니다.")
            break

if __name__ == "__main__":
    run_chat()
```

## 실행 결과 예시

```
==================================================
루미 챗봇에 오신 것을 환영합니다!
대화를 시작하세요. 종료하려면 '종료'를 입력하세요.
==================================================

당신: 안녕! 나는 민수야

루미: 안녕하세요, 민수님! 만나서 반가워요. 저는 루미예요.
오늘 어떤 이야기를 나눠볼까요?

당신: 오늘 날씨가 좋아서 산책했어

루미: 와, 좋은 하루를 보내셨네요, 민수님!
산책은 기분 전환에 정말 좋죠. 어디서 산책하셨어요?

당신: 내 이름이 뭐라고 했지?

루미: 민수님이라고 하셨어요!
처음에 자기소개해 주셨잖아요.

당신: 종료

루미: 민수님, 오늘 즐거운 대화였어요!
다음에 또 만나요. 좋은 하루 보내세요!

대화가 종료되었습니다.
```

## 다음 단계

- [도구를 사용하는 에이전트](/docs/examples/agent-with-tools) - 외부 도구를 호출하는 에이전트
- [체크포인팅](/docs/advanced/checkpointing) - 대화 상태 영구 저장
- [스트리밍](/docs/advanced/streaming) - 실시간 응답 출력
