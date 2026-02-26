// ══════════════════════════════════════════════════
//  Kubernetes: The Reload — Level Definitions
// ══════════════════════════════════════════════════

const LEVELS = [
  {
    id: 'look',
    name: 'Look',
    subtitle: 'Scout Lex',
    chibi: '../terminal/chibi-move.png',
    intro: "You can't fix what you can't see. Let's start with observation.",
    challenges: [
      {
        prompt: "Check the nodes in your cluster. How many do you have?",
        hint: "kubectl get — the verb is 'get', the resource is 'nodes'.",
        answer: "kubectl get nodes",
        check: (input) => /kubectl\s+get\s+(nodes|node|no)\b/.test(input),
        successMsg: "Three nodes. One control plane, two workers. That's your cluster."
      },
      {
        prompt: "List the pods in the default namespace.",
        hint: "Same pattern — kubectl get pods.",
        answer: "kubectl get pods",
        check: (input) => /kubectl\s+get\s+(pods|pod|po)\b/.test(input) && !/-n\s/.test(input) && !/-A/.test(input),
        successMsg: "Six pods — some healthy, some not. We'll get to that."
      },
      {
        prompt: "Now show the pods in the kube-system namespace.",
        hint: "Add -n kube-system to target a specific namespace.",
        answer: "kubectl get pods -n kube-system",
        check: (input) => /kubectl\s+get\s+(pods|pod|po)\b/.test(input) && /(-n\s+kube-system|--namespace\s+kube-system)/.test(input),
        successMsg: "The control plane pods. etcd, apiserver, scheduler, controller-manager — the brains of the operation."
      },
      {
        prompt: "Show all resource types (pods, services, deployments) in the default namespace at once.",
        hint: "kubectl get all — it's literally 'all'.",
        answer: "kubectl get all",
        check: (input) => /kubectl\s+get\s+all\b/.test(input),
        successMsg: "One command, full picture. Pods, services, deployments — everything in one view."
      },
    ],
    boss: {
      name: "The Panorama",
      intro: "Show every pod across every namespace, with extra detail — node assignments and IPs.",
      hint: "Combine --all-namespaces (or -A) with -o wide.",
      answer: "kubectl get pods -A -o wide",
      check: (input) => /kubectl\s+get\s+(pods|pod|po)\b/.test(input) && /(-A|--all-namespaces)/.test(input) && /(-o\s*wide|-owide|\s-w\b)/.test(input),
      successMsg: "Every pod, every namespace, every node assignment. That's situational awareness."
    }
  },
  {
    id: 'describe',
    name: 'Describe',
    subtitle: 'Inspector Lex',
    chibi: '../terminal/chibi-read.png',
    intro: "Names tell you what exists. Describe tells you what's happening.",
    challenges: [
      {
        prompt: "Describe the node called 'server' — what roles does it have?",
        hint: "kubectl describe node server",
        answer: "kubectl describe node server",
        check: (input) => /kubectl\s+describe\s+(node|nodes|no)\s+server/.test(input),
        successMsg: "Control plane. Tainted to prevent scheduling workloads — that's by design."
      },
      {
        prompt: "Describe the pod 'debug-pod' in the default namespace. What's wrong with it?",
        hint: "kubectl describe pod debug-pod",
        answer: "kubectl describe pod debug-pod",
        check: (input) => /kubectl\s+describe\s+(pod|pods|po)\s+debug-pod/.test(input),
        successMsg: "CrashLoopBackOff — it's crashing and Kubernetes keeps restarting it. The events tell the story."
      },
      {
        prompt: "List only the pods with the label app=webapp in the default namespace.",
        hint: "Use -l for label selector: kubectl get pods -l app=webapp",
        answer: "kubectl get pods -l app=webapp",
        check: (input) => /kubectl\s+get\s+(pods|pod|po)\b/.test(input) && /-l[\s=]*app=webapp/.test(input),
        successMsg: "Two webapp pods. Labels are how Kubernetes organizes everything — services, deployments, all of it."
      },
      {
        prompt: "Check the cluster events in the default namespace. What's happening?",
        hint: "kubectl get events — events are a resource type too.",
        answer: "kubectl get events",
        check: (input) => /kubectl\s+get\s+(events|event|ev)\b/.test(input),
        successMsg: "Scheduling failures, crashloops, liveness probes. Events are the cluster's diary."
      },
    ],
    boss: {
      name: "The Diagnosis",
      intro: "There's a pod called 'pending-pod' that won't schedule. Describe it to find out why.",
      hint: "kubectl describe pod pending-pod — look at the Conditions and Events sections.",
      answer: "kubectl describe pod pending-pod",
      check: (input) => /kubectl\s+describe\s+(pod|pods|po)\s+pending-pod/.test(input),
      successMsg: "Insufficient cpu. The scheduler can't find a node with enough resources. That's a capacity problem — you'd either add nodes or reduce resource requests."
    }
  },
  {
    id: 'create',
    name: 'Create',
    subtitle: 'Builder Lex',
    chibi: '../terminal/chibi-touch.png',
    intro: "Manifests are blueprints. Let's lay some foundations.",
    challenges: [
      {
        prompt: "Create a new namespace called 'staging'.",
        hint: "kubectl create namespace staging",
        answer: "kubectl create namespace staging",
        check: (input, output) => /kubectl\s+create\s+(namespace|ns)\s+staging/.test(input),
        successMsg: "Namespace created. An empty room, ready for whatever you put in it."
      },
      {
        prompt: "Run a pod called 'nginx-test' using the image nginx:1.25.",
        hint: "kubectl run with --image.",
        answer: "kubectl run nginx-test --image=nginx:1.25",
        check: (input) => /kubectl\s+run\s+nginx-test\b/.test(input) && /--image[=\s]+nginx/.test(input),
        successMsg: "Pod running. kubectl run is the quick way — for real workloads you'd use a Deployment."
      },
      {
        prompt: "Apply the manifest file nginx-pod.yaml.",
        hint: "kubectl apply -f filename.yaml",
        answer: "kubectl apply -f nginx-pod.yaml",
        check: (input) => /kubectl\s+apply\s+-f\s+nginx-pod\.yaml/.test(input),
        successMsg: "Applied. Declarative management — you describe the desired state, Kubernetes makes it happen."
      },
      {
        prompt: "Delete the pod you just ran — 'nginx-test'.",
        hint: "kubectl delete pod nginx-test",
        answer: "kubectl delete pod nginx-test",
        check: (input) => /kubectl\s+delete\s+(pod|pods|po)\s+nginx-test/.test(input),
        successMsg: "Gone. Pods are cattle, not pets — delete and recreate without guilt."
      },
    ],
    boss: {
      name: "The Scaffold",
      intro: "Create a namespace called 'test-env', then run a pod called 'test-runner' with image busybox:1.36 inside it. Two commands.",
      hint: "kubectl create namespace test-env && kubectl run test-runner --image=busybox:1.36 -n test-env",
      answer: "kubectl create namespace test-env && kubectl run test-runner --image=busybox:1.36 -n test-env",
      check: (input) => {
        return /kubectl\s+create\s+(namespace|ns)\s+test-env/.test(input) && /kubectl\s+run\s+test-runner/.test(input) && /-n\s+test-env/.test(input);
      },
      successMsg: "Namespace and pod — from nothing to running in one line. That's infrastructure as intention."
    }
  },
  {
    id: 'logs',
    name: 'Logs',
    subtitle: 'Debugger Lex',
    chibi: '../terminal/chibi-pipe.png',
    intro: "Logs are the black box. When things break, this is where you start.",
    challenges: [
      {
        prompt: "Show the logs for the 'api-server-7f94cb6b58-zt4qw' pod.",
        hint: "kubectl logs <pod-name>",
        answer: "kubectl logs api-server-7f94cb6b58-zt4qw",
        check: (input) => /kubectl\s+logs?\s+api-server-7f94cb6b58-zt4qw/.test(input) && !/(--tail|--previous|-p)/.test(input),
        successMsg: "Redis connection issues, slow queries, a panic. This pod has seen some things."
      },
      {
        prompt: "Show only the last 3 lines of logs from that same api-server pod.",
        hint: "kubectl logs --tail=3 <pod-name>",
        answer: "kubectl logs --tail 3 api-server-7f94cb6b58-zt4qw",
        check: (input) => /kubectl\s+logs?\b/.test(input) && /--tail[\s=]+3/.test(input) && /api-server/.test(input),
        successMsg: "Tail is triage mode. See the most recent entries without scrolling through everything."
      },
      {
        prompt: "The prometheus-server-0 pod in monitoring has two containers. Show logs for the 'config-reloader' container.",
        hint: "Use -c to specify the container: kubectl logs <pod> -c <container> -n <namespace>",
        answer: "kubectl logs prometheus-server-0 -c config-reloader -n monitoring",
        check: (input) => /kubectl\s+logs?\b/.test(input) && /prometheus-server-0/.test(input) && /-c\s+config-reloader/.test(input) && /-n\s+monitoring/.test(input),
        successMsg: "Multi-container pods need you to be specific. Sidecars, init containers — always know which one you're reading."
      },
      {
        prompt: "The 'debug-pod' keeps crashing. Show the logs from its previous run.",
        hint: "kubectl logs --previous (or -p) to see the last terminated container's output.",
        answer: "kubectl logs debug-pod --previous",
        check: (input) => /kubectl\s+logs?\s+debug-pod/.test(input) && /(--previous|-p\b)/.test(input),
        successMsg: "Missing config file. The pod crashes on startup because /etc/debug/config.yaml doesn't exist. Now you know what to fix."
      },
    ],
    boss: {
      name: "The Black Box",
      intro: "Something is wrong with the api-server pod. It's been restarting. Find out how many ERROR lines are in its logs — use the full log output and count them visually.",
      hint: "kubectl logs api-server-7f94cb6b58-zt4qw — look for [ERROR] lines.",
      answer: "kubectl logs api-server-7f94cb6b58-zt4qw",
      check: (input) => /kubectl\s+logs?\s+api-server-7f94cb6b58-zt4qw/.test(input),
      successMsg: "Three errors — two Redis connection failures and a nil pointer panic. In a real incident, you'd check Redis next. That's the thread to pull."
    }
  },
  {
    id: 'scale',
    name: 'Scale',
    subtitle: 'Conductor Lex',
    chibi: '../terminal/chibi-lock.png',
    intro: "One replica is a liability. Let's talk about resilience.",
    challenges: [
      {
        prompt: "Scale the 'webapp' deployment to 4 replicas.",
        hint: "kubectl scale deployment webapp --replicas=4",
        answer: "kubectl scale deployment webapp --replicas=4",
        check: (input) => /kubectl\s+scale\s+(deployment|deploy)\s+webapp/.test(input) && /--replicas[=\s]+4/.test(input),
        successMsg: "Scaled. Four pods serving traffic instead of two. That's horizontal scaling."
      },
      {
        prompt: "Check the rollout status of the 'webapp' deployment.",
        hint: "kubectl rollout status deployment webapp",
        answer: "kubectl rollout status deployment webapp",
        check: (input) => /kubectl\s+rollout\s+status\b/.test(input) && /webapp/.test(input),
        successMsg: "Successfully rolled out. Every scale-up, every image update — rollout status tells you when it's done."
      },
      {
        prompt: "Show the rollout history for the 'api-server' deployment.",
        hint: "kubectl rollout history deployment api-server",
        answer: "kubectl rollout history deployment api-server",
        check: (input) => /kubectl\s+rollout\s+history\b/.test(input) && /api-server/.test(input),
        successMsg: "Two revisions. Each deployment change is tracked — that's your rollback safety net."
      },
      {
        prompt: "Roll back the 'api-server' deployment to its previous revision.",
        hint: "kubectl rollout undo deployment api-server",
        answer: "kubectl rollout undo deployment api-server",
        check: (input) => /kubectl\s+rollout\s+undo\b/.test(input) && /api-server/.test(input),
        successMsg: "Rolled back. The previous image is now running. In a real outage, this buys you time while you fix the new version."
      },
    ],
    boss: {
      name: "The Surge",
      intro: "Traffic spike incoming. Scale the webapp to 6 replicas and verify it rolled out successfully. Two commands.",
      hint: "kubectl scale deployment webapp --replicas=6 && kubectl rollout status deployment webapp",
      answer: "kubectl scale deployment webapp --replicas=6 && kubectl rollout status deployment webapp",
      check: (input) => /kubectl\s+scale\b/.test(input) && /--replicas[=\s]+6/.test(input) && /kubectl\s+rollout\s+status\b/.test(input),
      successMsg: "Six replicas, all healthy. You just handled a traffic surge in two commands. That's the kind of muscle memory that matters at 3am."
    }
  },
  {
    id: 'expose',
    name: 'Expose',
    subtitle: 'Gateway Lex',
    chibi: '../terminal/chibi-cut.png',
    intro: "Pods are ephemeral. Services are the stable address.",
    challenges: [
      {
        prompt: "List the services in the default namespace.",
        hint: "kubectl get svc — 'svc' is the short name for services.",
        answer: "kubectl get svc",
        check: (input) => /kubectl\s+get\s+(services|service|svc)\b/.test(input) && !/-n\s/.test(input) && !/-A/.test(input),
        successMsg: "Four services. ClusterIP for internal, NodePort for external access. Each one is a stable front door."
      },
      {
        prompt: "Expose the 'api-server' deployment as a NodePort service on port 8080.",
        hint: "kubectl expose deployment api-server --port=8080 --type=NodePort",
        answer: "kubectl expose deployment api-server --port=8080 --type=NodePort",
        check: (input) => /kubectl\s+expose\s+(deployment|deploy)\s+api-server/.test(input) && /--type[=\s]+NodePort/.test(input),
        successMsg: "Exposed. NodePort means any node's IP plus the assigned port reaches this service. Quick and dirty external access."
      },
      {
        prompt: "Set up a port-forward to the redis-master-0 pod — local port 6379 to container port 6379.",
        hint: "kubectl port-forward redis-master-0 6379:6379",
        answer: "kubectl port-forward redis-master-0 6379:6379",
        check: (input) => /kubectl\s+port-forward\s+redis-master-0\s+6379:6379/.test(input),
        successMsg: "Forwarding. Now localhost:6379 hits the pod directly. Perfect for debugging — terrible for production."
      },
      {
        prompt: "Show all services across all namespaces.",
        hint: "kubectl get svc -A",
        answer: "kubectl get svc -A",
        check: (input) => /kubectl\s+get\s+(services|service|svc)\b/.test(input) && /(-A|--all-namespaces)/.test(input),
        successMsg: "Every service in the cluster. LoadBalancers, NodePorts, ClusterIPs — the full network topology."
      },
    ],
    boss: {
      name: "The Gateway",
      intro: "The frontend deployment in the 'app' namespace needs a NodePort service on port 80. Expose it, then verify the service was created.",
      hint: "kubectl expose deployment frontend --port=80 --type=NodePort -n app && kubectl get svc -n app",
      answer: "kubectl expose deployment frontend --port=80 --type=NodePort -n app && kubectl get svc -n app",
      check: (input) => /kubectl\s+expose\b/.test(input) && /frontend/.test(input) && /-n\s+app/.test(input) && /kubectl\s+get\s+(svc|services?)/.test(input),
      successMsg: "Service created, traffic flowing. You just opened the front door to your application."
    }
  },
  {
    id: 'config',
    name: 'Config',
    subtitle: 'Architect Lex',
    chibi: '../terminal/chibi-watch.png',
    intro: "Context is everything. Know which cluster you're talking to.",
    challenges: [
      {
        prompt: "Show your current context — which cluster are you connected to?",
        hint: "kubectl config current-context",
        answer: "kubectl config current-context",
        check: (input) => /kubectl\s+config\s+current-context/.test(input),
        successMsg: "kthw. You built this cluster with your own hands."
      },
      {
        prompt: "List all available contexts.",
        hint: "kubectl config get-contexts",
        answer: "kubectl config get-contexts",
        check: (input) => /kubectl\s+config\s+get-contexts/.test(input),
        successMsg: "Three contexts — kthw, staging, minikube. The asterisk marks where you are now."
      },
      {
        prompt: "Switch to the 'staging' context.",
        hint: "kubectl config use-context staging",
        answer: "kubectl config use-context staging",
        check: (input) => /kubectl\s+config\s+use-context\s+staging/.test(input),
        successMsg: "Switched. Every kubectl command now hits the staging cluster. Context is everything — run commands on the wrong cluster and you'll have a very bad day."
      },
      {
        prompt: "Switch back to the 'kthw' context.",
        hint: "kubectl config use-context kthw",
        answer: "kubectl config use-context kthw",
        check: (input) => /kubectl\s+config\s+use-context\s+kthw/.test(input),
        successMsg: "Home again. Always double-check your context before destructive operations."
      },
    ],
    boss: {
      name: "The Wrong Cluster",
      intro: "You need to verify you're on the kthw context, then show the current context to confirm. Trust but verify.",
      hint: "kubectl config use-context kthw && kubectl config current-context",
      answer: "kubectl config use-context kthw && kubectl config current-context",
      check: (input) => /kubectl\s+config\s+use-context\s+kthw/.test(input) && /kubectl\s+config\s+current-context/.test(input),
      successMsg: "Confirmed: kthw. In a real incident, the first thing you do is verify your context. The second-worst thing that can happen during an outage is fixing the wrong cluster."
    }
  },
  {
    id: 'triage',
    name: 'Triage',
    subtitle: 'Commander Lex',
    chibi: '../terminal/chibi-tricks.png',
    intro: "The cluster is on fire. Time to prove you belong in the war room.",
    challenges: [
      {
        prompt: "Check resource usage across all nodes. Which one is under the most pressure?",
        hint: "kubectl top nodes",
        answer: "kubectl top nodes",
        check: (input) => /kubectl\s+top\s+(nodes|node)\b/.test(input),
        successMsg: "node-0 at 83% memory. That's your hot spot."
      },
      {
        prompt: "Check pod resource usage in the default namespace. What's eating resources?",
        hint: "kubectl top pods",
        answer: "kubectl top pods",
        check: (input) => /kubectl\s+top\s+(pods|pod)\b/.test(input),
        successMsg: "api-server is the heaviest. 85m CPU, 256Mi memory. In a real cluster, you'd check its resource limits next."
      },
      {
        prompt: "Exec into the api-server pod and run 'hostname' to verify you're inside.",
        hint: "kubectl exec api-server-7f94cb6b58-zt4qw -- hostname",
        answer: "kubectl exec api-server-7f94cb6b58-zt4qw -- hostname",
        check: (input) => /kubectl\s+exec\s+api-server-7f94cb6b58-zt4qw/.test(input) && /hostname/.test(input),
        successMsg: "You're in. Exec is your last resort for debugging — when logs aren't enough, you go inside."
      },
      {
        prompt: "Cordon node-0 to prevent new pods from being scheduled there.",
        hint: "kubectl cordon node-0",
        answer: "kubectl cordon node-0",
        check: (input) => /kubectl\s+cordon\s+node-0/.test(input),
        successMsg: "Cordoned. No new pods will land on node-0. Existing pods keep running — this is a soft quarantine."
      },
    ],
    boss: {
      name: "The Incident",
      intro: "node-0 is at 83% memory and needs maintenance. Drain it — move all pods off safely. You'll need --ignore-daemonsets since kube-proxy runs there.",
      hint: "kubectl drain node-0 --ignore-daemonsets",
      answer: "kubectl drain node-0 --ignore-daemonsets",
      check: (input) => /kubectl\s+drain\s+node-0/.test(input) && /--ignore-daemonsets/.test(input),
      successMsg: null
    }
  },
];
